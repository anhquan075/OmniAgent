import pytest

from app.services.shared.ledger import TradeLedger
from app.services.trading.proof_bundle import ProofBundleService


@pytest.mark.asyncio
async def test_latest_receipt_status_uses_cached_ledger_without_rpc(monkeypatch, tmp_path) -> None:
    from app.core.settings import get_settings

    tx_hash = "0x" + "1" * 64
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    TradeLedger.append_event({
        "eventType": "trade_receipt_confirmed",
        "tradeIntentId": "intent-1",
        "txHash": tx_hash,
        "payload": {
            "blockNumber": 1,
            "proof": {"valid": True, "reasons": []},
            "explorerUrl": f"https://bscscan.com/tx/{tx_hash}",
        },
    })

    async def fail_rpc(_: dict[str, object]) -> dict[str, object]:
        raise AssertionError("proof bundle must not poll RPC by default")

    monkeypatch.setattr("app.services.trading.receipt.ReceiptProofService.get_trade_status", fail_rpc)
    result = await ProofBundleService.latest_receipt_status(
        {"tradeIntentId": "intent-1", "txHash": tx_hash},
    )

    assert result["source"] == "ledger"
    assert result["status"] == "confirmed"
    assert result["proof"]["valid"] is True
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_latest_receipt_status_returns_not_polled_without_cached_receipt(monkeypatch, tmp_path) -> None:
    from app.core.settings import get_settings

    tx_hash = "0x" + "2" * 64
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    TradeLedger.append_event({
        "eventType": "trade_executed",
        "tradeIntentId": "intent-2",
        "txHash": tx_hash,
        "payload": {"bridgeMode": "rest"},
    })

    result = await ProofBundleService.latest_receipt_status(
        {"tradeIntentId": "intent-2", "txHash": tx_hash},
    )

    assert result["status"] == "not_polled"
    assert result["proof"]["reasons"] == ["receipt_not_polled"]
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_live_proof_bundle_skips_funded_cycle_by_default(monkeypatch, tmp_path) -> None:
    from app.core.settings import get_settings

    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    captured: dict[str, object] = {}

    async def fake_preflight(args: dict[str, object]) -> dict[str, object]:
        captured.update(args)
        return {
            "readyForLiveTrade": False,
            "readyToEnableLive": False,
            "blockers": [],
            "checks": [],
        }

    monkeypatch.setattr(
        "app.services.trading.proof_bundle.LivePreflightService.get_live_preflight",
        fake_preflight,
    )

    result = await ProofBundleService.get_live_proof_bundle({"limit": 3})

    assert captured["skipFundedCycle"] is True
    assert result["workOrderLifecycle"]["state"] == "intent_created"
    get_settings.cache_clear()
