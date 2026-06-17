import json
import re
from datetime import datetime, timezone

from app.core.settings import get_settings
from app.services.cmc.agent_hub_recommendations import CmcAgentHubRecommendationService

MAX_LIVE_SIGNAL_AGE_SECONDS = 300

class CmcSignalConfigService:
    @staticmethod
    def live_cmc_tool_blocker(
        execute: bool,
        tool_name: str | None,
        signal: dict[str, object] | None,
        symbol: str | None = None,
        side: str | None = None,
    ) -> str | None:
        if not execute:
            return None
        if not tool_name:
            if signal and signal.get("reason"):
                return str(signal["reason"])
            return "CMC Agent Hub signal tool is required before live execution."
        if not signal or not signal.get("ready"):
            return str((signal or {}).get("reason") or "CMC Agent Hub signal tool is not ready.")
        freshness = CmcSignalConfigService.signal_freshness_blocker(signal)
        if freshness:
            return freshness
        semantic_validation = signal.get("semanticValidation")
        if isinstance(semantic_validation, dict) and semantic_validation.get("ready") is False:
            return str(semantic_validation.get("reason") or "CMC Agent Hub signal semantics are not ready.")
        semantics = CmcSignalConfigService.signal_semantics_blocker(signal, symbol=symbol, side=side)
        if semantics:
            return semantics
        return None

    @staticmethod
    def signal_freshness_blocker(signal: dict[str, object]) -> str | None:
        timestamp = signal.get("timestamp")
        if not isinstance(timestamp, str) or not timestamp:
            return "CMC Agent Hub signal timestamp is required before live execution."
        try:
            created_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            return "CMC Agent Hub signal timestamp is invalid."
        age_seconds = (datetime.now(timezone.utc) - created_at.astimezone(timezone.utc)).total_seconds()
        if age_seconds < 0:
            return "CMC Agent Hub signal timestamp is from the future."
        if age_seconds > MAX_LIVE_SIGNAL_AGE_SECONDS:
            return "CMC Agent Hub signal is stale; refresh it before live execution."
        return None

    @staticmethod
    def configured_cmc_signal_tool(args: dict[str, object]) -> str | None:
        raw = get_settings().cmc_agent_hub_signal_tool
        tool_name = str(raw or "").strip()
        return tool_name or None

    @staticmethod
    async def resolved_cmc_signal_config(
        args: dict[str, object],
        *,
        symbol: str,
        side: str,
        amount_usd: float,
    ) -> tuple[str | None, dict[str, object], str | None, str]:
        signal_args = CmcSignalConfigService.configured_cmc_signal_args(args, symbol=symbol, side=side, amount_usd=amount_usd)
        tool_name = CmcSignalConfigService.configured_cmc_signal_tool(args)
        if tool_name:
            return tool_name, signal_args, None, "pinned"
        recommendation = await CmcAgentHubRecommendationService.recommend_cmc_agent_hub_signal_tools(limit=1)
        recommended_tool = str(recommendation.get("recommendedToolName") or "").strip()
        if not recommendation.get("ready") or not recommended_tool:
            return None, signal_args, str(recommendation.get("reason") or "CMC Agent Hub did not recommend a signal tool."), "missing"
        recommended_args = recommendation.get("recommendedArgs")
        if isinstance(recommended_args, dict):
            return recommended_tool, {
                **signal_args,
                **recommended_args,
                "symbol": symbol,
                "side": side,
                "amountUsd": amount_usd,
            }, None, "auto_discovered"
        return recommended_tool, signal_args, None, "auto_discovered"

    @staticmethod
    def configured_cmc_signal_args(
        args: dict[str, object],
        *,
        symbol: str,
        side: str,
        amount_usd: float,
    ) -> dict[str, object]:
        strategy_args = {"symbol": symbol, "side": side, "amountUsd": amount_usd}
        env_raw = get_settings().cmc_agent_hub_signal_args
        if not env_raw:
            return strategy_args
        try:
            parsed = json.loads(env_raw)
        except json.JSONDecodeError as error:
            raise ValueError(f"CMC_AGENT_HUB_SIGNAL_ARGS must be a JSON object: {error}") from error
        if not isinstance(parsed, dict):
            raise ValueError("CMC_AGENT_HUB_SIGNAL_ARGS must be a JSON object.")
        return {**parsed, **strategy_args}

    @staticmethod
    def signal_semantics_blocker(
        signal: dict[str, object],
        *,
        symbol: str | None,
        side: str | None,
    ) -> str | None:
        expected_side = str(side or "").lower()
        if not expected_side:
            return None
        candidates = [
            signal.get("signal"),
            signal.get("side"),
            signal.get("action"),
            signal.get("recommendation"),
            signal.get("parsedContent"),
            signal.get("result"),
        ]
        if CmcSignalConfigService.contains_trade_side(candidates, expected_side):
            return None
        expected_symbol = str(symbol or "").upper()
        suffix = f" for {expected_symbol}" if expected_symbol else ""
        return f"CMC Agent Hub signal must include a {expected_side} trade signal{suffix}."

    @staticmethod
    def signal_semantic_validation(
        signal: dict[str, object],
        *,
        symbol: str | None,
        side: str | None,
    ) -> dict[str, object]:
        expected_side = str(side or "").lower()
        expected_symbol = str(symbol or "").upper()
        requirement = {
            "symbol": expected_symbol,
            "side": expected_side,
            "label": " ".join(item for item in (expected_side, expected_symbol, "trade signal") if item),
        }
        reason = CmcSignalConfigService.signal_semantics_blocker(signal, symbol=symbol, side=side)
        return {
            "ready": reason is None,
            "reason": reason,
            "requiredTradeSignal": requirement,
        }

    @staticmethod
    def contains_trade_side(value: object, expected_side: str) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized == expected_side:
                return True
            if CmcSignalConfigService.negates_trade_side(normalized, expected_side):
                return False
            return re.search(rf"(^|[^a-z0-9]){re.escape(expected_side)}([^a-z0-9]|$)", normalized) is not None
        if isinstance(value, list):
            return any(CmcSignalConfigService.contains_trade_side(item, expected_side) for item in value[:16])
        if isinstance(value, dict):
            signal_values = (
                value.get("signal"),
                value.get("side"),
                value.get("action"),
                value.get("recommendation"),
            )
            if any(CmcSignalConfigService.contains_trade_side(item, expected_side) for item in signal_values):
                return True
            return any(CmcSignalConfigService.contains_trade_side(item, expected_side) for item in list(value.values())[:16])
        return False

    @staticmethod
    def negates_trade_side(value: str, expected_side: str) -> bool:
        patterns = (
            rf"\bno\s+{re.escape(expected_side)}\b",
            rf"\bnot\s+{re.escape(expected_side)}\b",
            rf"\bdo\s+not\s+{re.escape(expected_side)}\b",
            rf"\bdon't\s+{re.escape(expected_side)}\b",
            rf"\bavoid\s+{re.escape(expected_side)}\b",
        )
        return any(re.search(pattern, value) for pattern in patterns)
