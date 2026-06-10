import json
from datetime import datetime, timezone

from app.core.settings import get_settings
from app.services.trading.execution import TradeExecutionService
from app.services.trading.registration import CompetitionRegistrationService


REGISTERED_WALLET = "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"
OTHER_WALLET = "0x1111111111111111111111111111111111111111"
COMPETITION_CONTRACT = "0x212c61b9b72c95d95bf29cf032f5e5635629aed5"
REGISTRATION_BLOCKER = "competition registration proof is required before live execution"


def write_aged_registration_ledger(
    ledger_path,
    wallet_address: str,
    *,
    receipt_valid: bool = False,
) -> None:
    payload = {
        "walletAddress": wallet_address,
        "competitionContractAddress": COMPETITION_CONTRACT,
        "chainId": 56,
    }
    if receipt_valid:
        payload["receiptProof"] = {"valid": True, "reasons": []}
    events = [
        {
            "eventType": "competition_registered",
            "txHash": "0x" + "c" * 64,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
    ]
    events.extend(
        {
            "eventType": "risk_checked",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "payload": {"sequence": index},
        }
        for index in range(1001)
    )
    ledger_path.write_text(
        "".join(json.dumps(event, separators=(",", ":")) + "\n" for event in events),
        encoding="utf-8",
    )


def execution_blockers(monkeypatch) -> list[str]:
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    monkeypatch.setattr(
        "app.services.wallet.agent_wallet.AgentWalletService.get_wallet_data",
        lambda: {"walletAddress": REGISTERED_WALLET, "twakReady": True},
    )
    get_settings.cache_clear()
    return TradeExecutionService.execution_blockers(
        {"chainId": 56, "data": "0x1234"},
        {"approved": True, "reasons": []},
        {"ready": True},
        {"configured": True, "reachable": True, "symbols": {"BNB": {"priceUsd": 1}}},
        {
            "ready": True,
            "toolName": "crypto.signal.test",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


def test_old_registration_proof_requires_valid_receipt_proof(monkeypatch, tmp_path) -> None:
    ledger_path = tmp_path / "ledger.jsonl"
    write_aged_registration_ledger(ledger_path, REGISTERED_WALLET)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    get_settings.cache_clear()

    assert not CompetitionRegistrationService.has_stored_registration_proof(REGISTERED_WALLET)
    assert REGISTRATION_BLOCKER in execution_blockers(monkeypatch)
    get_settings.cache_clear()


def test_old_registration_proof_with_valid_receipt_still_unlocks_live_execution(monkeypatch, tmp_path) -> None:
    ledger_path = tmp_path / "ledger.jsonl"
    write_aged_registration_ledger(ledger_path, REGISTERED_WALLET, receipt_valid=True)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    get_settings.cache_clear()

    assert CompetitionRegistrationService.has_stored_registration_proof(REGISTERED_WALLET)
    assert REGISTRATION_BLOCKER not in execution_blockers(monkeypatch)
    get_settings.cache_clear()


def test_old_registration_proof_still_requires_matching_wallet(monkeypatch, tmp_path) -> None:
    ledger_path = tmp_path / "ledger.jsonl"
    write_aged_registration_ledger(ledger_path, OTHER_WALLET, receipt_valid=True)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    get_settings.cache_clear()

    assert not CompetitionRegistrationService.has_stored_registration_proof(REGISTERED_WALLET)
    assert REGISTRATION_BLOCKER in execution_blockers(monkeypatch)
    get_settings.cache_clear()
