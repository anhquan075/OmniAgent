from typing import Any

from app.core.settings import get_settings
from app.services.agent.openrouter_advisor import OpenRouterTradingAdvisor
from app.services.agent.tactical_chart_signal import TacticalChartSignalService
from app.services.shared.ledger import TradeLedger


class TradingStrategyDecisionService:
    @staticmethod
    async def evaluate(
        *,
        symbol: str,
        side: str,
        amount_usd: float,
        slippage_bps: int,
        cmc_snapshot: dict[str, Any],
        cmc_agent_hub_signal: dict[str, Any] | None,
        execute: bool,
    ) -> dict[str, Any]:
        settings = get_settings()
        ledger = TradeLedger.get_ledger_summary(limit=8)
        context = {
            "network": "bsc",
            "symbol": symbol,
            "requestedSide": side,
            "requestedAmountUsd": amount_usd,
            "requestedSlippageBps": slippage_bps,
            "limits": {
                "maxTradeUsd": settings.bnb_max_trade_usd,
                "maxSlippageBps": settings.bnb_max_slippage_bps,
                "minConfidence": settings.bnb_strategy_min_confidence,
                "maxPositionPct": settings.bnb_strategy_max_position_pct,
                "allowlist": sorted(settings.token_allowlist),
            },
            "cmcSnapshot": cmc_snapshot,
            "cmcAgentHubSignal": cmc_agent_hub_signal,
            "tacticalSignal": TacticalChartSignalService.from_market_context(
                cmc_snapshot,
                cmc_agent_hub_signal,
                symbol,
            ),
            "ledger": {"dailyCompliance": ledger.get("dailyCompliance"), "pnl": ledger.get("pnl")},
        }
        deterministic = TradingStrategyDecisionService.deterministic_decision(context)
        advisor = await TradingStrategyDecisionService.llm_decision(context) if settings.bnb_strategy_advisor_enabled else {
            "ready": False,
            "reason": "BNB_STRATEGY_ADVISOR_ENABLED is false",
        }
        selected = TradingStrategyDecisionService.select_decision(deterministic, advisor, execute)
        return {"source": selected["source"], "decision": selected["decision"], "deterministic": deterministic, "advisor": advisor}

    @staticmethod
    async def llm_decision(context: dict[str, Any]) -> dict[str, Any]:
        return await OpenRouterTradingAdvisor.advise(context)

    @staticmethod
    def deterministic_decision(context: dict[str, Any]) -> dict[str, Any]:
        settings = get_settings()
        symbol = str(context["symbol"]).upper()
        requested_side = str(context["requestedSide"]).lower()
        requested_amount = float(context["requestedAmountUsd"])
        requested_slippage = int(context["requestedSlippageBps"])
        market = TradingStrategyDecisionService.market_row(context["cmcSnapshot"], symbol)
        reasons: list[str] = []
        risks: list[str] = []

        if symbol not in settings.token_allowlist:
            reasons.append("token_not_allowlisted")
        if not market or not market.get("priceUsd"):
            reasons.append("live_price_missing")
        signal = context.get("cmcAgentHubSignal")
        if not isinstance(signal, dict) or signal.get("ready") is not True:
            risks.append("cmc_agent_hub_signal_not_ready")
        tactical = context.get("tacticalSignal") if isinstance(context.get("tacticalSignal"), dict) else {}
        if tactical.get("ready"):
            tactical_type = str(tactical.get("type") or "neutral")
            if requested_side == "buy" and tactical_type == "sell":
                reasons.append("heikin_ashi_5m_sell_signal")
            if requested_side == "sell" and tactical_type == "buy":
                risks.append("heikin_ashi_5m_buy_signal")
            if tactical_type == "buy" and requested_side == "buy":
                risks.append(f"heikin_ashi_{tactical.get('detail')}_{tactical.get('strength')}pct")
            if tactical_type == "sell" and requested_side == "sell":
                risks.append(f"heikin_ashi_{tactical.get('detail')}_{tactical.get('strength')}pct")
        else:
            risks.append(str(tactical.get("reason") or "heikin_ashi_chart_unavailable"))

        change_1h = TradingStrategyDecisionService.as_float((market or {}).get("percentChange1h"))
        change_24h = TradingStrategyDecisionService.as_float((market or {}).get("percentChange24h"))
        change_7d = TradingStrategyDecisionService.as_float((market or {}).get("percentChange7d"))
        if requested_side == "buy":
            if change_24h is not None and change_24h <= -6 and (change_1h or 0) <= -1:
                reasons.append("falling_knife_momentum")
            if change_24h is not None and change_24h >= 12 and (change_1h or 0) >= 2.5:
                reasons.append("entry_overextended")
            if change_7d is not None and change_7d <= -12 and (change_24h or 0) < 0:
                reasons.append("multi_day_downtrend")
        if requested_side == "sell" and change_24h is not None and change_24h <= -8:
            risks.append("selling_after_large_down_move")

        confidence = 0.66
        if change_1h is not None and change_24h is not None:
            if requested_side == "buy" and change_1h > 0 and 0 <= change_24h <= 10:
                confidence += 0.08
            if requested_side == "sell" and change_1h < 0 and change_24h < 0:
                confidence += 0.06
        if tactical.get("ready") and tactical.get("type") == requested_side:
            confidence += min(float(tactical.get("strength") or 0) / 500, 0.12)
        if reasons:
            confidence = min(confidence, 0.35)

        action = "hold" if reasons or confidence < settings.bnb_strategy_min_confidence else requested_side
        max_amount = min(requested_amount, settings.bnb_max_trade_usd)
        pnl = (context.get("ledger") or {}).get("pnl") if isinstance(context.get("ledger"), dict) else {}
        drawdown = TradingStrategyDecisionService.as_float((pnl or {}).get("maxDrawdownPct")) or 0
        if drawdown >= settings.bnb_max_drawdown_pct * 0.5:
            max_amount *= 0.5
            risks.append("drawdown_reduced_position_size")

        rationale = "Hold: " + ", ".join(reasons) if action == "hold" else (
            f"{requested_side} allowed: live CMC price with bounded size and slippage"
        )
        return {
            "ready": True,
            "decision": {
                "action": action,
                "confidence": round(max(0.0, min(confidence, 1.0)), 3),
                "maxAmountUsd": round(max_amount, 6),
                "slippageBps": min(requested_slippage, settings.bnb_max_slippage_bps),
                "rationale": rationale,
                "risks": risks[:5],
                "dataQuality": "medium" if market else "weak",
            },
        }

    @staticmethod
    def select_decision(deterministic: dict[str, Any], advisor: dict[str, Any], execute: bool) -> dict[str, Any]:
        settings = get_settings()
        deterministic_decision = deterministic["decision"]
        if deterministic_decision["action"] == "hold":
            return {"source": "deterministic", "decision": deterministic_decision}
        if settings.bnb_strategy_require_llm_for_live and execute and not advisor.get("ready"):
            return {
                "source": "policy",
                "decision": {**deterministic_decision, "action": "hold", "rationale": str(advisor.get("reason") or "llm_required_for_live")},
            }
        advisor_decision = advisor.get("decision") if isinstance(advisor.get("decision"), dict) else None
        if not advisor.get("ready") or not advisor_decision:
            return {"source": "deterministic", "decision": deterministic_decision}
        advisor_action = str(advisor_decision.get("action") or "hold").lower()
        advisor_confidence = float(advisor_decision.get("confidence") or 0)
        deterministic_action = str(deterministic_decision["action"]).lower()
        if advisor_action == "hold" or advisor_confidence < settings.bnb_strategy_min_confidence:
            return {"source": "openrouter", "decision": {**advisor_decision, "action": "hold"}}
        if advisor_action != deterministic_action:
            return {
                "source": "policy",
                "decision": {
                    **deterministic_decision,
                    "action": "hold",
                    "rationale": "Hold: advisor direction disagrees with deterministic policy",
                    "risks": [*deterministic_decision.get("risks", []), "advisor_direction_disagreement"][:5],
                },
            }
        max_amount = min(float(deterministic_decision["maxAmountUsd"]), float(advisor_decision["maxAmountUsd"]))
        slippage_bps = min(int(deterministic_decision["slippageBps"]), int(advisor_decision.get("slippageBps") or deterministic_decision["slippageBps"]))
        return {
            "source": "openrouter",
            "decision": {
                **advisor_decision,
                "action": deterministic_action,
                "maxAmountUsd": round(max_amount, 6),
                "slippageBps": slippage_bps,
            },
        }

    @staticmethod
    def market_row(snapshot: dict[str, Any], symbol: str) -> dict[str, Any] | None:
        symbols = snapshot.get("symbols") if isinstance(snapshot.get("symbols"), dict) else {}
        item = symbols.get(symbol.upper()) if isinstance(symbols, dict) else None
        return item if isinstance(item, dict) else None

    @staticmethod
    def as_float(value: Any) -> float | None:
        return float(value) if isinstance(value, int | float) else None
