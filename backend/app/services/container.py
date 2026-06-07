from dataclasses import dataclass
from typing import Type

from app.services.adapters.runtime import DynamicAgentAdapterRegistry, FastApiBnbAgentAdapter
from app.services.agent.identity import BnbAgentIdentityService
from app.services.agent.status import BnbAgentStatusService
from app.services.agent.autonomous_cycle import AutonomousTradingAgent
from app.services.wallet.balances import CapitalReadinessService
from app.services.cmc.prices import CmcPriceService
from app.services.cmc.agent_hub import CmcAgentHubClient
from app.services.cmc.skill_hub import CmcSkillHubClient
from app.services.agent.cockpit import AgentCockpitService
from app.services.trading.execution import TradeExecutionService
from app.services.shared.ledger import TradeLedger
from app.services.trading.live_preflight import LivePreflightService
from app.services.trading.pancake import PancakeRouterService
from app.services.trading.receipt import ReceiptProofService
from app.services.trading.registration import CompetitionRegistrationService
from app.services.trading.risk import RiskCheckService
from app.services.tools import McpToolRegistry
from app.services.twak.bridge import TrustWalletBridge
from app.services.twak.cli import TrustWalletCliClient
from app.services.twak.rest import TrustWalletRestClient
from app.services.wallet.agent_wallet import AgentWalletService
from app.services.wallet.x402 import X402PaymentService


@dataclass(frozen=True)
class ServiceContainer:
    agent_identity: Type[BnbAgentIdentityService] = BnbAgentIdentityService
    adapter_registry: Type[DynamicAgentAdapterRegistry] = DynamicAgentAdapterRegistry
    agent_adapter: Type[FastApiBnbAgentAdapter] = FastApiBnbAgentAdapter
    agent_status: Type[BnbAgentStatusService] = BnbAgentStatusService
    autonomous_agent: Type[AutonomousTradingAgent] = AutonomousTradingAgent
    capital: Type[CapitalReadinessService] = CapitalReadinessService
    cmc_agent_hub: Type[CmcAgentHubClient] = CmcAgentHubClient
    cmc_skill_hub: Type[CmcSkillHubClient] = CmcSkillHubClient
    cockpit: Type[AgentCockpitService] = AgentCockpitService
    execution: Type[TradeExecutionService] = TradeExecutionService
    ledger: Type[TradeLedger] = TradeLedger
    live_preflight: Type[LivePreflightService] = LivePreflightService
    mcp_tools: Type[McpToolRegistry] = McpToolRegistry
    pancake: Type[PancakeRouterService] = PancakeRouterService
    prices: Type[CmcPriceService] = CmcPriceService
    receipt: Type[ReceiptProofService] = ReceiptProofService
    registration: Type[CompetitionRegistrationService] = CompetitionRegistrationService
    risk: Type[RiskCheckService] = RiskCheckService
    trust_wallet: Type[TrustWalletBridge] = TrustWalletBridge
    twak_cli: Type[TrustWalletCliClient] = TrustWalletCliClient
    twak_rest: Type[TrustWalletRestClient] = TrustWalletRestClient
    wallet: Type[AgentWalletService] = AgentWalletService
    x402: Type[X402PaymentService] = X402PaymentService

    @classmethod
    def default(cls) -> "ServiceContainer":
        return cls()
