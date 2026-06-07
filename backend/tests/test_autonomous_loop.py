import pytest

from app.core.settings import get_settings
from app.services.agent.autonomous_loop import AutonomousLoopService


def test_autonomous_loop_payload_uses_settings(monkeypatch) -> None:
    monkeypatch.setenv("BNB_AUTONOMOUS_LOOP_SYMBOL", "TWT")
    monkeypatch.setenv("BNB_AUTONOMOUS_LOOP_SIDE", "sell")
    monkeypatch.setenv("BNB_AUTONOMOUS_LOOP_AMOUNT_USD", "7")
    monkeypatch.setenv("BNB_AUTONOMOUS_LOOP_SLIPPAGE_BPS", "25")
    monkeypatch.setenv("BNB_AUTONOMOUS_LOOP_EXECUTE", "true")
    get_settings.cache_clear()

    payload = AutonomousLoopService.cycle_payload(get_settings())

    assert payload == {
        "symbol": "TWT",
        "side": "sell",
        "amountUsd": 7.0,
        "slippageBps": 25,
        "signalSource": "cmc",
        "execute": True,
        "recordLedger": True,
    }
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_autonomous_loop_run_once_invokes_agent(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    async def fake_cycle(args: dict[str, object]) -> dict[str, object]:
        calls.append(args)
        return {
            "tradeIntentId": "intent-auto",
            "status": "ready",
            "mode": "dry_run",
        }

    monkeypatch.setattr(
        "app.services.agent.autonomous_loop.AutonomousTradingAgent.run_autonomous_cycle",
        fake_cycle,
    )
    monkeypatch.setenv("BNB_AUTONOMOUS_LOOP_SYMBOL", "CAKE")
    monkeypatch.setenv("BNB_AUTONOMOUS_LOOP_EXECUTE", "false")
    get_settings.cache_clear()

    result = await AutonomousLoopService.run_once(get_settings())

    assert result["tradeIntentId"] == "intent-auto"
    assert calls[0]["symbol"] == "CAKE"
    assert calls[0]["execute"] is False
    get_settings.cache_clear()
