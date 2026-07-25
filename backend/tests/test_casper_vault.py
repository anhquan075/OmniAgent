"""Tests for collateral vault action mapping and gate logic."""

from pathlib import Path
from typing import Any

from app.core.settings import get_settings
from app.services.casper.account import CasperAccountService
from app.services.casper.public_proof import CasperPublicProofService
from app.services.casper.vault import (
    ACTION_TO_VAULT_EP,
    VERIFIED_ENTRY_POINTS,
    CasperVaultService,
)


def test_action_mapping_covers_policy_vocabulary() -> None:
    assert ACTION_TO_VAULT_EP["block"] == "freeze"
    assert ACTION_TO_VAULT_EP["approve"] == "unfreeze"
    assert ACTION_TO_VAULT_EP["haircut"] == "set_ltv"
    assert CasperVaultService.map_action("hold") is None
    assert CasperVaultService.map_action("warn") is None


def test_enforce_skipped_when_disabled(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_VAULT_ENFORCE_ENABLED", "false")

    get_settings.cache_clear()
    assert CasperVaultService.enforce_from_decision({"action": "block"}) is None


def test_enforce_skipped_for_unmapped_action(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_VAULT_ENFORCE_ENABLED", "true")
    monkeypatch.setenv("CASPER_VAULT_CONTRACT_HASH", "hash-abc")
    get_settings.cache_clear()
    result = CasperVaultService.enforce_from_decision({"action": "hold", "decisionId": "d1"})
    assert result is not None
    assert result["status"] == "skipped"


def test_enforce_blocked_without_receipt(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_VAULT_ENFORCE_ENABLED", "true")
    monkeypatch.setenv("CASPER_VAULT_CONTRACT_HASH", "hash-abc")
    get_settings.cache_clear()
    result = CasperVaultService.enforce_from_decision(
        {"action": "block", "decisionId": "d1", "decisionReceipt": {}}
    )
    assert result is not None
    assert result["status"] == "blocked"
    assert "casper_vault_receipt_missing" in result["hardBlockers"]


def test_verified_command_uses_separate_contract_and_entry_point(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_VAULT_CONTRACT_HASH", "legacy-contract")
    monkeypatch.setenv("CASPER_VAULT_VERIFIED_CONTRACT_HASH", "verified-contract")
    get_settings.cache_clear()
    monkeypatch.setattr(
        CasperAccountService,
        "secret_key_path",
        staticmethod(lambda: Path("/tmp/secret_key.pem")),
    )

    command = CasperVaultService.build_vault_command(
        entry_point="freeze",
        asset_id="asset-1",
        decision_id="decision-1",
        receipt="decision-1|block|22|proof|why|source|time|approved|agent|guardrail",
        verified=True,
    )

    assert VERIFIED_ENTRY_POINTS["freeze"] == "enforce_verified"
    assert command[command.index("--session-hash") + 1] == "verified-contract"
    assert command[command.index("--session-entry-point") + 1] == "enforce_verified"
    assert "ltv_bps:u64='5000'" in command


def test_legacy_command_remains_available_for_rollback(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_VAULT_CONTRACT_HASH", "legacy-contract")
    monkeypatch.setenv("CASPER_VAULT_VERIFIED_CONTRACT_HASH", "verified-contract")
    get_settings.cache_clear()
    monkeypatch.setattr(
        CasperAccountService,
        "secret_key_path",
        staticmethod(lambda: Path("/tmp/secret_key.pem")),
    )

    command = CasperVaultService.build_vault_command(
        entry_point="freeze",
        asset_id="asset-1",
        decision_id="decision-1",
        receipt="receipt",
        verified=False,
    )

    assert command[command.index("--session-hash") + 1] == "legacy-contract"
    assert command[command.index("--session-entry-point") + 1] == "freeze"


def test_enforce_routes_to_cross_contract_path_when_enabled(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_VAULT_ENFORCE_ENABLED", "true")
    monkeypatch.setenv("CASPER_VAULT_VERIFIED_ENABLED", "true")
    monkeypatch.setenv("CASPER_VAULT_VERIFIED_CONTRACT_HASH", "verified-contract")
    get_settings.cache_clear()
    captured: dict[str, Any] = {}

    def fake_submit_entry(**kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"submitted": True}

    monkeypatch.setattr(CasperVaultService, "submit_entry", staticmethod(fake_submit_entry))
    receipt = "decision-1|block|22|proof|why|source|time|approved|agent|guardrail"

    result = CasperVaultService.enforce_from_decision(
        {
            "action": "block",
            "decisionId": "decision-1",
            "decisionReceipt": {"receiptValue": receipt},
        }
    )

    assert result == {"submitted": True}
    assert captured["entry_point"] == "freeze"
    assert captured["verified"] is True
    assert captured["receipt"] == receipt


def test_public_vault_proof_exposes_cross_contract_mode(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_VAULT_ENFORCE_ENABLED", "true")
    monkeypatch.setenv("CASPER_VAULT_VERIFIED_ENABLED", "true")
    monkeypatch.setenv("CASPER_VAULT_VERIFIED_CONTRACT_HASH", "verified-contract")
    monkeypatch.setenv("CASPER_VAULT_VERIFIED_PACKAGE_HASH", "verified-package")
    monkeypatch.setenv("CASPER_VAULT_VERIFIED_CANARY_TX_HASH", "canary-tx")
    monkeypatch.setenv("CASPER_VAULT_VERIFIED_CANARY_DECISION_ID", "decision-1")
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "decision-contract")
    get_settings.cache_clear()

    vault = CasperPublicProofService._vault(get_settings())

    assert vault["verificationMode"] == "cross_contract"
    assert vault["contractHash"] == "verified-contract"
    assert vault["packageHash"] == "verified-package"
    assert vault["proofContractHash"] == "decision-contract"
    assert vault["actionMap"]["haircut"] == "enforce_verified"
    assert vault["transactionHash"] == "canary-tx"
    assert vault["decisionId"] == "decision-1"
    assert vault["lastAction"] == "haircut"
    assert vault["lastStatus"] == "confirmed"
    assert vault["stateDelta"]["entryPoint"] == "set_ltv"
