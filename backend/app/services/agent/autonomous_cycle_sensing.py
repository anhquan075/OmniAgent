from typing import Any

from app.services.cmc.agent_hub import CmcAgentHubClient
from app.services.cmc.agent_hub_tools import CmcAgentHubToolClient
from app.services.cmc.prices import CmcPriceService
from app.services.cmc.signal_config import CmcSignalConfigService


class AutonomousCycleSensing:
    @staticmethod
    async def collect(
        *,
        args: dict[str, object],
        symbol: str,
        side: str,
        amount_usd: float,
        signal_source: str,
        execute: bool,
        stages: list[dict[str, object]],
    ) -> dict[str, Any]:
        tool_name, tool_args, tool_reason, resolution = await CmcSignalConfigService.resolved_cmc_signal_config(
            args,
            symbol=symbol,
            side=side,
            amount_usd=amount_usd,
        )
        cmc_agent_hub = await CmcAgentHubClient.get_cmc_agent_hub_status()
        cmc_snapshot = await CmcPriceService.get_price_snapshot([symbol, "BNB"])
        cmc_ready = (
            bool(cmc_agent_hub.get("ready"))
            and bool(cmc_snapshot.get("configured"))
            and cmc_snapshot.get("reachable") is not False
        )
        stages[0] = {
            "stage": "sense",
            "state": "completed" if cmc_ready else "blocked",
            "tool": "cmc_agent_hub_status",
            "note": "cmc_agent_hub_ready" if cmc_agent_hub.get("ready") else str(
                cmc_agent_hub.get("reason") or "cmc_agent_hub_unavailable"
            ),
        }
        stages.append({
            "stage": "sense_price",
            "state": "completed" if cmc_ready else "blocked",
            "tool": "cmc_get_price_snapshot",
            "note": "cmc_live_signal" if cmc_ready else str(cmc_snapshot.get("reason") or "cmc_unavailable"),
        })
        signal = await AutonomousCycleSensing.call_signal_tool(
            tool_name=tool_name,
            tool_args=tool_args,
            tool_reason=tool_reason,
            resolution=resolution,
            execute=execute,
            stages=stages,
        )
        return {
            "cmcSignalTool": tool_name,
            "cmcAgentHub": cmc_agent_hub,
            "cmcSnapshot": cmc_snapshot,
            "cmcAgentHubSignal": signal,
        }

    @staticmethod
    async def call_signal_tool(
        *,
        tool_name: str | None,
        tool_args: dict[str, object],
        tool_reason: str | None,
        resolution: str,
        execute: bool,
        stages: list[dict[str, object]],
    ) -> dict[str, object] | None:
        if tool_name:
            signal = await CmcAgentHubToolClient.call_cmc_agent_hub_tool({
                "toolName": tool_name,
                "arguments": tool_args,
            })
            signal = {**signal, "resolution": resolution}
            stages.append({
                "stage": "sense_agent_hub",
                "state": "completed" if signal.get("ready") else "blocked",
                "tool": "cmc_agent_hub_call_tool",
                "note": "cmc_agent_hub_tool_ready" if signal.get("ready") else str(
                    signal.get("reason") or "cmc_agent_hub_tool_unavailable"
                ),
            })
            return signal
        if execute:
            stages.append({
                "stage": "sense_agent_hub",
                "state": "blocked",
                "tool": "cmc_agent_hub_call_tool",
                "note": tool_reason or "cmc_agent_hub_tool_required_for_live_execution",
            })
        return None
