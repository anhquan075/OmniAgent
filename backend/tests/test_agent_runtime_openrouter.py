import asyncio
from datetime import datetime, timezone

from app.core.settings import get_settings
from app.services.agent.runtime_snapshot import BnbAgentRuntimeService


def test_runtime_snapshot_calls_openrouter_agent_core(monkeypatch) -> None:
    advisor_calls: list[dict[str, object]] = []

    async def fake_cockpit(limit: int = 10) -> dict[str, object]:
        assert limit == 25
        return {
            "wallet": {"walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"},
            "sdkStatus": {"ready": True, "installed": True, "registrationEnabled": False},
            "twakStatus": {"ready": True},
            "prices": {
                "configured": True,
                "reachable": True,
                "symbols": {
                    "BNB": {
                        "symbol": "BNB",
                        "priceUsd": 600,
                        "percentChange1h": -0.2,
                        "percentChange24h": -1.0,
                    }
                },
            },
            "ledger": {"events": [], "dailyCompliance": {"progress": "0/7"}, "pnl": {}},
        }

    async def fake_preflight(_: dict[str, object]) -> dict[str, object]:
        return {
            "readyForLiveTrade": False,
            "blockers": [],
            "fundedStrategy": {"symbol": "BNB", "side": "sell", "amountUsd": 0.25, "slippageBps": 50},
            "cmcAgentHubSignal": {
                "ready": True,
                "parsedContent": [{"summary": "sell BNB trade signal"}],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        }

    async def fake_proof(_: dict[str, object]) -> dict[str, object]:
        return {"status": "guarded", "proofScore": {"score": 5, "maxScore": 8, "hardBlocked": False}}

    async def fake_advise(context: dict[str, object]) -> dict[str, object]:
        advisor_calls.append(context)
        return {
            "ready": True,
            "model": "openrouter-test-model",
            "decision": {
                "action": "sell",
                "confidence": 0.7,
                "maxAmountUsd": 0.1,
                "slippageBps": 40,
                "rationale": "OpenRouter agrees with the BNB sell route.",
                "risks": [],
                "dataQuality": "medium",
            },
        }

    monkeypatch.setenv("BNB_STRATEGY_ADVISOR_ENABLED", "true")
    monkeypatch.setattr("app.services.agent.runtime_snapshot.AgentCockpitService.get_cockpit_snapshot", fake_cockpit)
    monkeypatch.setattr("app.services.agent.runtime_snapshot.LivePreflightService.get_live_preflight", fake_preflight)
    monkeypatch.setattr("app.services.agent.runtime_snapshot.ProofBundleService.get_live_proof_bundle", fake_proof)
    monkeypatch.setattr("app.services.agent.strategy_decision.OpenRouterTradingAdvisor.advise", fake_advise)
    monkeypatch.setattr(
        "app.services.agent.strategy_decision.TradeLedger.get_ledger_summary",
        lambda limit=8: {"dailyCompliance": {"progress": "0/7"}, "pnl": {}},
    )
    get_settings.cache_clear()

    result = asyncio.run(BnbAgentRuntimeService.get_runtime_snapshot({}))

    assert advisor_calls
    assert advisor_calls[0]["symbol"] == "BNB"
    assert advisor_calls[0]["requestedSide"] == "sell"
    assert result["coreAgent"]["provider"] == "openrouter"  # type: ignore[index]
    assert result["coreAgent"]["runtimeRole"] == "agent_core"  # type: ignore[index]
    assert result["coreAgent"]["called"] is True  # type: ignore[index]
    assert result["coreAgent"]["ready"] is True  # type: ignore[index]
    assert result["coreAgent"]["model"] == "openrouter-test-model"  # type: ignore[index]
    assert result["coreAgent"]["strategyDecision"]["source"] == "openrouter"  # type: ignore[index]
    assert result["openRouterAdvisor"]["ready"] is True  # type: ignore[index]
    get_settings.cache_clear()
