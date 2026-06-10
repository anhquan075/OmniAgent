from typing import Any

from app.core.settings import get_settings
from app.services.agent.strategy_decision import TradingStrategyDecisionService


class BnbAgentCoreRuntimeAdvisor:
    @staticmethod
    async def evaluate(cockpit: dict[str, Any], preflight: dict[str, Any]) -> dict[str, object]:
        settings = get_settings()
        strategy = preflight.get("fundedStrategy") if isinstance(preflight.get("fundedStrategy"), dict) else {}
        symbol = str(strategy.get("symbol") or settings.bnb_autonomous_loop_symbol or "CAKE").upper()
        side = str(strategy.get("side") or settings.bnb_autonomous_loop_side or "buy").lower()
        amount_usd = float(strategy.get("amountUsd") or settings.bnb_autonomous_loop_amount_usd or 25)
        slippage_bps = int(strategy.get("slippageBps") or settings.bnb_autonomous_loop_slippage_bps or 50)
        if not settings.bnb_strategy_advisor_enabled:
            return BnbAgentCoreRuntimeAdvisor.disabled(symbol, side, amount_usd, slippage_bps)

        cmc_snapshot = cockpit.get("prices") if isinstance(cockpit.get("prices"), dict) else {}
        cmc_signal = preflight.get("cmcAgentHubSignal") if isinstance(preflight.get("cmcAgentHubSignal"), dict) else None
        decision = await TradingStrategyDecisionService.evaluate(
            symbol=symbol,
            side=side,
            amount_usd=amount_usd,
            slippage_bps=slippage_bps,
            cmc_snapshot=cmc_snapshot,
            cmc_agent_hub_signal=cmc_signal,
            execute=False,
        )
        advisor = decision.get("advisor") if isinstance(decision.get("advisor"), dict) else {}
        return {
            "provider": "openrouter",
            "runtimeRole": "agent_core",
            "called": True,
            "ready": bool(advisor.get("ready")),
            "model": advisor.get("model") or settings.openrouter_model,
            "reason": advisor.get("reason"),
            "symbol": symbol,
            "side": side,
            "amountUsd": amount_usd,
            "slippageBps": slippage_bps,
            "strategyDecision": decision,
            "decision": decision.get("decision") if isinstance(decision.get("decision"), dict) else {},
        }

    @staticmethod
    def disabled(symbol: str, side: str, amount_usd: float, slippage_bps: int) -> dict[str, object]:
        return {
            "provider": "openrouter",
            "runtimeRole": "agent_core",
            "called": False,
            "ready": False,
            "model": get_settings().openrouter_model,
            "reason": "BNB_STRATEGY_ADVISOR_ENABLED is false",
            "symbol": symbol,
            "side": side,
            "amountUsd": amount_usd,
            "slippageBps": slippage_bps,
            "strategyDecision": {
                "source": "disabled",
                "advisor": {"ready": False, "reason": "BNB_STRATEGY_ADVISOR_ENABLED is false"},
                "decision": {"action": "hold", "rationale": "OpenRouter advisor is disabled."},
            },
            "decision": {"action": "hold", "rationale": "OpenRouter advisor is disabled."},
        }
