"""Tests for collateral vault action mapping and gate logic."""

from app.services.casper.vault import ACTION_TO_VAULT_EP, CasperVaultService


def test_action_mapping_covers_policy_vocabulary() -> None:
    assert ACTION_TO_VAULT_EP["block"] == "freeze"
    assert ACTION_TO_VAULT_EP["approve"] == "unfreeze"
    assert ACTION_TO_VAULT_EP["haircut"] == "set_ltv"
    assert CasperVaultService.map_action("hold") is None
    assert CasperVaultService.map_action("warn") is None


def test_enforce_skipped_when_disabled(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_VAULT_ENFORCE_ENABLED", "false")
    from app.core.settings import get_settings

    get_settings.cache_clear()
    assert CasperVaultService.enforce_from_decision({"action": "block"}) is None


def test_enforce_skipped_for_unmapped_action(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_VAULT_ENFORCE_ENABLED", "true")
    monkeypatch.setenv("CASPER_VAULT_CONTRACT_HASH", "hash-abc")
    from app.core.settings import get_settings

    get_settings.cache_clear()
    result = CasperVaultService.enforce_from_decision({"action": "hold", "decisionId": "d1"})
    assert result is not None
    assert result["status"] == "skipped"


def test_enforce_blocked_without_receipt(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_VAULT_ENFORCE_ENABLED", "true")
    monkeypatch.setenv("CASPER_VAULT_CONTRACT_HASH", "hash-abc")
    from app.core.settings import get_settings

    get_settings.cache_clear()
    result = CasperVaultService.enforce_from_decision(
        {"action": "block", "decisionId": "d1", "decisionReceipt": {}}
    )
    assert result is not None
    assert result["status"] == "blocked"
    assert "casper_vault_receipt_missing" in result["hardBlockers"]
