from app.core.settings import get_settings
from app.services.cmc.agent_hub_tools import CmcAgentHubToolClient
from app.services.cmc.signal_config import CmcSignalConfigService

class CmcSignalProofService:
    @staticmethod
    async def with_server_cmc_agent_hub_signal(args: dict[str, object]) -> dict[str, object]:
        if not get_settings().bnb_trading_enabled:
            return args
        symbol = str(args.get("symbol") or "CAKE").upper()
        side = str(args.get("side") or "buy").lower()
        amount_usd = float(args.get("amountUsd") or 25)
        tool_name, signal_args, reason, resolution = await CmcSignalConfigService.resolved_cmc_signal_config(
            args,
            symbol=symbol,
            side=side,
            amount_usd=amount_usd,
        )
        if not tool_name:
            return {**args, "cmcAgentHubSignal": {"ready": False, "reason": reason, "resolution": resolution}}
        signal = await CmcAgentHubToolClient.call_cmc_agent_hub_tool({"toolName": tool_name, "arguments": signal_args})
        return {**args, "cmcAgentHubSignal": {**signal, "serverVerified": True, "resolution": resolution}}
