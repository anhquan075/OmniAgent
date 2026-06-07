import json
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
        raw = args.get("cmcAgentHubTool") or get_settings().cmc_agent_hub_signal_tool
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
        return recommended_tool, recommended_args if isinstance(recommended_args, dict) else signal_args, None, "auto_discovered"

    @staticmethod
    def configured_cmc_signal_args(
        args: dict[str, object],
        *,
        symbol: str,
        side: str,
        amount_usd: float,
    ) -> dict[str, object]:
        raw = args.get("cmcAgentHubArgs")
        if isinstance(raw, dict):
            return raw
        env_raw = get_settings().cmc_agent_hub_signal_args
        if not env_raw:
            return {"symbol": symbol, "side": side, "amountUsd": amount_usd}
        try:
            parsed = json.loads(env_raw)
        except json.JSONDecodeError as error:
            raise ValueError(f"CMC_AGENT_HUB_SIGNAL_ARGS must be a JSON object: {error}") from error
        if not isinstance(parsed, dict):
            raise ValueError("CMC_AGENT_HUB_SIGNAL_ARGS must be a JSON object.")
        return parsed
