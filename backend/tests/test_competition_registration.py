import asyncio
import json
from datetime import datetime, timezone

from app.core.settings import get_settings
from app.services.trading.execution import TradeExecutionService
from app.services.trading.registration import CompetitionRegistrationService
from app.services.trading.registration_status import CompetitionRegistrationStatusService


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


def execution_blockers(monkeypatch, competition_status: dict[str, object] | None = None) -> list[str]:
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
        competition_status,
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


def test_bundled_registration_proof_unlocks_empty_runtime_ledger(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("BNB_BUNDLED_REGISTRATION_PROOF_ENABLED", "true")
    get_settings.cache_clear()

    proof = CompetitionRegistrationService.stored_registration_proof(REGISTERED_WALLET)

    assert proof is not None
    assert proof["txHash"] == "0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4"
    assert REGISTRATION_BLOCKER not in execution_blockers(monkeypatch)
    get_settings.cache_clear()


def test_live_competition_status_unlocks_live_execution_without_jsonl(monkeypatch, tmp_path) -> None:
    ledger_path = tmp_path / "ledger.jsonl"
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    get_settings.cache_clear()

    assert REGISTRATION_BLOCKER not in execution_blockers(
        monkeypatch,
        {
            "registered": True,
            "participant": REGISTERED_WALLET,
            "competitionContractAddress": COMPETITION_CONTRACT,
            "chainId": 56,
        },
    )
    assert not ledger_path.exists()
    get_settings.cache_clear()


def test_live_competition_status_rejects_another_wallet(monkeypatch) -> None:
    monkeypatch.setenv("BNB_COMPETITION_CONTRACT_ADDRESS", COMPETITION_CONTRACT)
    get_settings.cache_clear()

    proof = CompetitionRegistrationStatusService.status_registration_proof(
        REGISTERED_WALLET,
        {
            "registered": True,
            "participant": OTHER_WALLET,
            "competitionContractAddress": COMPETITION_CONTRACT,
            "chainId": 56,
        },
    )

    assert proof is None
    get_settings.cache_clear()


def test_live_competition_status_requires_wallet_binding(monkeypatch) -> None:
    monkeypatch.setenv("BNB_COMPETITION_CONTRACT_ADDRESS", COMPETITION_CONTRACT)
    get_settings.cache_clear()

    proof = CompetitionRegistrationStatusService.status_registration_proof(
        REGISTERED_WALLET,
        {
            "registered": True,
            "competitionContractAddress": COMPETITION_CONTRACT,
            "chainId": 56,
        },
    )

    assert proof is None
    get_settings.cache_clear()


def test_rpc_competition_status_proves_registration_without_jsonl(monkeypatch, tmp_path) -> None:
    tx_hash = "0x" + "e" * 64

    async def fake_rpc_call(method: str, params: list[object]) -> object:
        assert method == "eth_getLogs"
        log_filter = params[0]
        assert isinstance(log_filter, dict)
        assert log_filter["topics"][1].endswith(REGISTERED_WALLET.lower().removeprefix("0x"))
        return [{"transactionHash": tx_hash, "blockNumber": hex(102615129)}]

    async def fake_twak_status() -> None:
        return None

    monkeypatch.setattr(
        "app.services.trading.registration_status.CompetitionRegistrationStatusService.get_twak_competition_status",
        fake_twak_status,
    )
    monkeypatch.setattr(
        "app.services.trading.registration_rpc_status.CompetitionRegistrationRpcStatusService.rpc_call",
        fake_rpc_call,
    )
    ledger_path = tmp_path / "ledger.jsonl"
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    get_settings.cache_clear()

    status = asyncio.run(
        CompetitionRegistrationStatusService.get_competition_status(REGISTERED_WALLET)
    )

    assert status["source"] == "bsc-rpc"
    assert status["registered"] is True
    assert not ledger_path.exists()
    assert REGISTRATION_BLOCKER not in execution_blockers(monkeypatch, status)
    get_settings.cache_clear()


def test_rpc_limit_uses_bundled_registration_proof(monkeypatch, tmp_path) -> None:
    async def fake_rpc_call(method: str, params: list[object]) -> object:
        raise ValueError("limit exceeded")

    async def fake_twak_status() -> None:
        return None

    monkeypatch.setattr(
        "app.services.trading.registration_status.CompetitionRegistrationStatusService.get_twak_competition_status",
        fake_twak_status,
    )
    monkeypatch.setattr(
        "app.services.trading.registration_rpc_status.CompetitionRegistrationRpcStatusService.rpc_call",
        fake_rpc_call,
    )
    monkeypatch.setenv("BNB_BUNDLED_REGISTRATION_PROOF_ENABLED", "true")
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()

    status = asyncio.run(
        CompetitionRegistrationStatusService.get_competition_status(REGISTERED_WALLET)
    )

    assert status["source"] == "stored-registration-proof"
    assert status["registered"] is True
    assert status["fallbackFrom"]["reason"] == "limit exceeded"
    assert REGISTRATION_BLOCKER not in execution_blockers(monkeypatch, status)
    get_settings.cache_clear()


def test_cmc_signal_blocker_does_not_emit_jsonl_registration_blocker(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    monkeypatch.setattr(
        "app.services.wallet.agent_wallet.AgentWalletService.get_wallet_data",
        lambda: {"walletAddress": REGISTERED_WALLET, "twakReady": True},
    )
    get_settings.cache_clear()

    reasons = TradeExecutionService.execution_blockers(
        {"chainId": 56, "data": "0x1234"},
        {"approved": True, "reasons": [], "observed": {"symbol": "BNB", "side": "sell"}},
        {"ready": True},
        {"configured": True, "reachable": True, "symbols": {"BNB": {"priceUsd": 1}}},
        {
            "ready": True,
            "toolName": "crypto.signal.test",
            "parsedContent": [{"signal": "hold"}],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )

    assert REGISTRATION_BLOCKER not in reasons
    assert "CMC Agent Hub signal must include a sell trade signal for BNB." in reasons
    get_settings.cache_clear()


def test_old_registration_proof_still_requires_matching_wallet(monkeypatch, tmp_path) -> None:
    ledger_path = tmp_path / "ledger.jsonl"
    write_aged_registration_ledger(ledger_path, OTHER_WALLET, receipt_valid=True)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    get_settings.cache_clear()

    assert not CompetitionRegistrationService.has_stored_registration_proof(REGISTERED_WALLET)
    assert REGISTRATION_BLOCKER in execution_blockers(monkeypatch)
    get_settings.cache_clear()
