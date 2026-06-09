import json

import pytest

from app.core.logging import configure_logging
from app.core.settings import get_settings
from app.services.agent.autonomous_cycle_summary import AutonomousCycleSummary
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


def test_autonomous_cycle_summary_keeps_strategy_for_dashboard() -> None:
    summary = AutonomousCycleSummary.from_result({
        "tradeIntentId": "intent-auto",
        "status": "ready",
        "mode": "dry_run",
        "symbol": "CAKE",
        "side": "buy",
        "strategyDecision": {"source": "deterministic", "decision": {"action": "buy", "confidence": 0.71}},
        "risk": {"approved": True},
        "stages": [{"stage": "strategy", "state": "approved"}],
        "ignoredLargeField": {"raw": "not exposed"},
    })

    assert summary["tradeIntentId"] == "intent-auto"
    assert summary["strategyDecision"] == {"source": "deterministic", "decision": {"action": "buy", "confidence": 0.71}}
    assert "ignoredLargeField" not in summary


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


@pytest.mark.asyncio
async def test_autonomous_loop_run_once_logs_json_schedule(monkeypatch, capsys) -> None:
    tx_hash = "0x" + "1" * 64

    async def fake_cycle(args: dict[str, object]) -> dict[str, object]:
        return {
            "tradeIntentId": "intent-auto",
            "status": "submitted",
            "mode": "execute",
            "execution": {"txHash": tx_hash},
        }

    monkeypatch.setattr(
        "app.services.agent.autonomous_loop.AutonomousTradingAgent.run_autonomous_cycle",
        fake_cycle,
    )
    monkeypatch.setenv("OMNIAGENT_LOG_JSON", "true")
    monkeypatch.setenv("BNB_AUTONOMOUS_LOOP_EXECUTE", "true")
    get_settings.cache_clear()
    configure_logging()

    await AutonomousLoopService.run_once(get_settings(), cycle_started_at="2026-06-09T00:00:00+00:00")

    records = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.strip()]
    events = {record["event"]: record for record in records}
    assert events["autonomous_loop_cycle_started"]["execute"] is True
    assert events["autonomous_loop_cycle_completed"]["tradeIntentId"] == "intent-auto"
    assert events["autonomous_loop_cycle_completed"]["txHash"] == tx_hash
    get_settings.cache_clear()
