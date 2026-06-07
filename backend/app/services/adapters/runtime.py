from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol

from app.services.agent.autonomous_cycle import AutonomousTradingAgent
from app.services.agent.cockpit import AgentCockpitService
from app.services.agent.identity import BnbAgentIdentityService
from app.services.agent.status import BnbAgentStatusService
from app.services.cmc.agent_hub import CmcAgentHubClient
from app.services.cmc.agent_hub_recommendations import CmcAgentHubRecommendationService
from app.services.cmc.agent_hub_tools import CmcAgentHubToolClient
from app.services.cmc.prices import CmcPriceService
from app.services.cmc.skill_hub import CmcSkillHubClient
from app.services.shared.ledger import TradeLedger
from app.services.trading.execution import TradeExecutionService
from app.services.trading.live_preflight import LivePreflightService
from app.services.trading.pancake import PancakeRouterService
from app.services.trading.proof_bundle import ProofBundleService
from app.services.trading.receipt import ReceiptProofService
from app.services.trading.registration import CompetitionRegistrationService
from app.services.trading.risk import RiskCheckService
from app.services.twak.bridge import TrustWalletBridge
from app.services.wallet.agent_wallet import AgentWalletService
from app.services.wallet.x402 import X402PaymentService

ToolPayload = dict[str, Any]
ToolHandler = Callable[[ToolPayload], ToolPayload | Awaitable[ToolPayload]]

TOOL_DESCRIPTIONS: dict[str, str] = {
    "bnb_agent_cockpit_snapshot": "Read the full BNB autonomous trading cockpit snapshot.",
    "bnb_get_wallet": "Read the configured TWAK agent wallet state.",
    "bnb_trust_wallet_status": "Validate the configured Trust Wallet Agent Kit execution surface.",
    "bnb_agent_sdk_status": "Read BNB Agent SDK runtime status.",
    "bnb_agent_sdk_register_identity": "Register or dry-run an ERC-8004 BNB Agent SDK identity proof.",
    "bnb_paid_resource_status": "Return CMC and TWAK x402 paid-resource readiness without unverified prize claims.",
    "bnb_record_paid_signal_access": "Record an x402 paid-resource attempt only when proof requirements are met.",
    "cmc_agent_hub_status": "Validate CoinMarketCap Agent Hub MCP connectivity and tool discovery.",
    "cmc_agent_hub_recommend_signal_tools": "Rank CMC Agent Hub MCP tools suitable for trade signals.",
    "cmc_agent_hub_call_tool": "Invoke a CoinMarketCap Agent Hub MCP tool by name.",
    "cmc_skill_hub_status": "Validate CMC Skill Hub MCP connectivity and find/execute tool discovery.",
    "cmc_skill_hub_find_skill": "Find CoinMarketCap Skill Hub strategy skills by query.",
    "cmc_skill_hub_execute_skill": "Execute a CoinMarketCap Skill Hub strategy skill through MCP.",
    "cmc_get_price_snapshot": "Read CoinMarketCap price snapshot.",
    "bnb_trade_ledger_summary": "Read append-only BNB trade ledger summary.",
    "bnb_risk_check": "Evaluate a bounded Track 1 trade intent.",
    "bnb_quote_trade": "Build a live PancakeSwap BSC router quote.",
    "bnb_simulate_trade": "Return a guarded dry-run execution preview.",
    "bnb_execute_trade": "Submit a guarded TWAK-signed BSC transaction.",
    "bnb_run_autonomous_cycle": "Run the backend autonomous quote-risk-simulate/execute cycle.",
    "bnb_live_preflight": "Strict preflight for CMC, TWAK, SDK, registration, capital, and live flags.",
    "bnb_live_proof_bundle": "Read live readiness, latest ledger evidence, and BSC receipt proof in one bundle.",
    "bnb_get_trade_status": "Read BSC receipt and transaction proof for a submitted trade.",
    "bnb_competition_register": "Register the agent wallet with the BNB Hack competition contract.",
    "bnb_emergency_pause": "Report emergency pause state.",
}


class AgentRuntimeAdapter(Protocol):
    adapter_id: str

    def list_tools(self, allowed_tools: set[str]) -> list[ToolPayload]: ...

    async def call_tool(self, name: str, args: ToolPayload) -> ToolPayload: ...

    async def run_autonomous_cycle(self, args: ToolPayload) -> ToolPayload: ...


@dataclass(frozen=True)
class RuntimeTool:
    name: str
    description: str
    handler: ToolHandler

    def metadata(self) -> ToolPayload:
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": {"type": "object", "properties": {}, "additionalProperties": True},
        }

    async def run(self, args: ToolPayload) -> ToolPayload:
        result = self.handler(args)
        if hasattr(result, "__await__"):
            return await result
        return result


class FastApiBnbAgentAdapter:
    adapter_id = "fastapi-bnb-agent"

    def list_tools(self, allowed_tools: set[str]) -> list[ToolPayload]:
        return [tool.metadata() for name, tool in self.tools().items() if name in allowed_tools]

    async def call_tool(self, name: str, args: ToolPayload) -> ToolPayload:
        tool = self.tools().get(name)
        if tool is None:
            raise KeyError(name)
        return await tool.run(args)

    async def run_autonomous_cycle(self, args: ToolPayload) -> ToolPayload:
        return await AutonomousTradingAgent.run_autonomous_cycle(args)

    def tools(self) -> dict[str, RuntimeTool]:
        handlers: dict[str, ToolHandler] = {
            "bnb_agent_cockpit_snapshot": self.cockpit,
            "bnb_get_wallet": self.wallet,
            "bnb_trust_wallet_status": self.trust_wallet_status,
            "bnb_agent_sdk_status": self.agent_sdk_status,
            "bnb_agent_sdk_register_identity": BnbAgentIdentityService.register_agent_identity,
            "bnb_paid_resource_status": lambda args: X402PaymentService.get_paid_resource_status(limit=int(args.get("limit") or 20)),
            "bnb_record_paid_signal_access": X402PaymentService.record_paid_signal_access,
            "cmc_agent_hub_status": lambda _: CmcAgentHubClient.get_cmc_agent_hub_status(),
            "cmc_agent_hub_recommend_signal_tools": lambda args: CmcAgentHubRecommendationService.recommend_cmc_agent_hub_signal_tools(limit=int(args.get("limit") or 8)),
            "cmc_agent_hub_call_tool": CmcAgentHubToolClient.call_cmc_agent_hub_tool,
            "cmc_skill_hub_status": lambda _: CmcSkillHubClient.get_cmc_skill_hub_status(),
            "cmc_skill_hub_find_skill": CmcSkillHubClient.find_cmc_skill,
            "cmc_skill_hub_execute_skill": CmcSkillHubClient.execute_cmc_skill,
            "cmc_get_price_snapshot": self.price_snapshot,
            "bnb_trade_ledger_summary": self.ledger,
            "bnb_risk_check": self.risk,
            "bnb_quote_trade": self.quote,
            "bnb_simulate_trade": TradeExecutionService.simulate_trade,
            "bnb_execute_trade": TradeExecutionService.execute_trade,
            "bnb_run_autonomous_cycle": self.run_autonomous_cycle,
            "bnb_live_preflight": LivePreflightService.get_live_preflight,
            "bnb_live_proof_bundle": ProofBundleService.get_live_proof_bundle,
            "bnb_get_trade_status": ReceiptProofService.get_trade_status,
            "bnb_competition_register": CompetitionRegistrationService.register_competition,
            "bnb_emergency_pause": self.emergency_pause,
        }
        return {name: RuntimeTool(name, TOOL_DESCRIPTIONS[name], handler) for name, handler in handlers.items()}

    @staticmethod
    async def cockpit(args: ToolPayload) -> ToolPayload:
        return await AgentCockpitService.get_cockpit_snapshot(limit=int(args.get("limit") or 10))

    @staticmethod
    def wallet(_: ToolPayload) -> ToolPayload:
        return {"network": "bsc", **AgentWalletService.get_wallet_data()}

    @staticmethod
    async def trust_wallet_status(_: ToolPayload) -> ToolPayload:
        return await TrustWalletBridge.get_trust_wallet_status()

    @staticmethod
    def agent_sdk_status(_: ToolPayload) -> ToolPayload:
        return {"network": "bsc", **BnbAgentStatusService.get_agent_sdk_status_dict()}

    @staticmethod
    async def price_snapshot(args: ToolPayload) -> ToolPayload:
        symbols = args.get("symbols")
        selected = symbols if isinstance(symbols, list) else ["BNB", "CAKE", "TWT"]
        return {"network": "bsc", **await CmcPriceService.get_price_snapshot([str(item) for item in selected])}

    @staticmethod
    def ledger(args: ToolPayload) -> ToolPayload:
        return {"network": "bsc", **TradeLedger.get_ledger_summary(limit=int(args.get("limit") or 10))}

    @staticmethod
    async def quote(args: ToolPayload) -> ToolPayload:
        return {"network": "bsc", "quote": await PancakeRouterService.build_router_quote(args)}

    @staticmethod
    def risk(args: ToolPayload) -> ToolPayload:
        return RiskCheckService.run_risk_check(
            symbol=str(args.get("symbol") or "CAKE"),
            side=str(args.get("side") or "buy"),
            amount_usd=float(args.get("amountUsd") or 25),
            slippage_bps=int(args.get("slippageBps") or 50),
            signal_source=str(args["signalSource"]) if "signalSource" in args else "cmc",
        )

    @staticmethod
    def emergency_pause(args: ToolPayload) -> ToolPayload:
        paused = bool(args.get("enabled"))
        event = TradeLedger.append_event({
            "eventType": "trade_blocked",
            "action": "emergency_pause",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "payload": {"emergencyPaused": paused},
        })
        return {"network": "bsc", "emergencyPaused": paused, "ledgerEvent": event}


class DynamicAgentAdapterRegistry:
    _adapters: dict[str, AgentRuntimeAdapter] = {FastApiBnbAgentAdapter.adapter_id: FastApiBnbAgentAdapter()}

    @classmethod
    def register(cls, adapter: AgentRuntimeAdapter) -> None:
        cls._adapters[adapter.adapter_id] = adapter

    @classmethod
    def resolve(cls, adapter_id: str | None) -> AgentRuntimeAdapter:
        selected = adapter_id or FastApiBnbAgentAdapter.adapter_id
        adapter = cls._adapters.get(selected)
        if adapter is None:
            raise KeyError(selected)
        return adapter

    @classmethod
    def default_adapter_id(cls) -> str:
        return FastApiBnbAgentAdapter.adapter_id
