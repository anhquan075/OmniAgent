from app.services.agent.status import BnbAgentStatusService
from app.services.agent.autonomous_cycle import AutonomousTradingAgent
from app.services.wallet.balances import CapitalReadinessService
from app.services.cmc.prices import CmcPriceService
from app.services.cmc.agent_hub import CmcAgentHubClient
from app.services.cmc.agent_hub_tools import CmcAgentHubToolClient
from app.services.cmc.signal_config import CmcSignalConfigService
from app.services.agent.cockpit import AgentCockpitService
from app.services.trading.registration import CompetitionRegistrationService
from app.services.trading.funded_strategy import FundedStrategyService
from app.services.twak.bridge import TrustWalletBridge
from app.services.wallet.agent_wallet import AgentWalletService

class LivePreflightService:
    @staticmethod
    async def get_live_preflight(args: dict[str, object] | None = None) -> dict[str, object]:
        args = args or {}
        wallet = AgentWalletService.get_wallet_data()
        wallet_address = str(wallet.get("walletAddress") or "")
        cmc = await CmcPriceService.get_price_snapshot(["BNB", "CAKE", "TWT"])
        cmc_agent_hub = await CmcAgentHubClient.get_cmc_agent_hub_status()
        capital = await CapitalReadinessService.get_capital_readiness(wallet_address)
        funded_strategy = LivePreflightService.build_funded_strategy(capital, cmc)
        cmc_agent_hub_signal = await LivePreflightService.validate_cmc_agent_hub_signal_tool(funded_strategy, args)
        skip_funded_cycle = bool(args.get("skipFundedCycle"))
        funded_cycle = {"_skipped": True} if skip_funded_cycle else await AutonomousTradingAgent.run_autonomous_cycle({
            **funded_strategy,
            "execute": False,
            "recordLedger": False,
        }) if funded_strategy else {}
        checks = LivePreflightService.build_checks(
            wallet=wallet,
            twak=await TrustWalletBridge.get_trust_wallet_status(),
            sdk=BnbAgentStatusService.get_agent_sdk_status_dict(),
            competition=await AgentCockpitService.get_competition_status(),
            capital=capital,
            cmc=cmc,
            cmc_agent_hub=cmc_agent_hub,
            cmc_agent_hub_signal=cmc_agent_hub_signal,
            funded_strategy=funded_strategy,
            funded_cycle=funded_cycle,
        )
        external_blockers = [item for item in checks if item["requiredBeforeEnable"] and not item["ok"]]
        live_blockers = [item for item in checks if item["requiredForLiveTrade"] and not item["ok"]]
        ready_to_enable = not external_blockers
        ready_for_live_trade = not live_blockers
        return {
            "network": "bsc",
            "readyToEnableLive": ready_to_enable,
            "readyForLiveTrade": ready_for_live_trade,
            "status": "ready_for_live_trade" if ready_for_live_trade else (
                "ready_to_enable_live" if ready_to_enable else "blocked"
            ),
            "blockers": [item for item in checks if not item["ok"]],
            "checks": checks,
            "fundedStrategy": funded_strategy,
            "cmcAgentHubSignal": cmc_agent_hub_signal,
        }

    @staticmethod
    async def validate_cmc_agent_hub_signal_tool(
        funded_strategy: dict[str, object] | None,
        args: dict[str, object] | None = None,
    ) -> dict[str, object]:
        args = args or {}
        strategy = funded_strategy or {"symbol": "CAKE", "side": "buy", "amountUsd": 1}
        tool_name, signal_args, reason, resolution = await CmcSignalConfigService.resolved_cmc_signal_config(
            args,
            symbol=str(strategy.get("symbol") or "CAKE"),
            side=str(strategy.get("side") or "buy"),
            amount_usd=float(strategy.get("amountUsd") or 1),
        )
        if not tool_name:
            return {
                "source": "coinmarketcap-agent-hub-mcp",
                "configured": False,
                "reachable": False,
                "ready": False,
                "toolName": None,
                "result": {},
                "parsedContent": None,
                "resolution": resolution,
                "reason": reason or "Set CMC_AGENT_HUB_SIGNAL_TOOL or pass cmcAgentHubTool before live trading.",
            }
        signal = await CmcAgentHubToolClient.call_cmc_agent_hub_tool({"toolName": tool_name, "arguments": signal_args})
        return {**signal, "serverVerified": True, "resolution": resolution}

    @staticmethod
    def build_checks(
        wallet: dict[str, object],
        twak: dict[str, object],
        sdk: dict[str, object],
        competition: dict[str, object] | None,
        capital: dict[str, object],
        cmc: dict[str, object],
        cmc_agent_hub: dict[str, object],
        cmc_agent_hub_signal: dict[str, object],
        funded_strategy: dict[str, object] | None,
        funded_cycle: dict[str, object],
    ) -> list[dict[str, object]]:
        checks = [
            LivePreflightService.check("wallet", bool(wallet.get("walletAddress")), "Agent wallet is not configured."),
            LivePreflightService.check("twak", bool(twak.get("ready")), str(twak.get("reason") or "TWAK REST wallet is not validated.")),
            LivePreflightService.check("bnb_agent_sdk", bool(sdk.get("ready")), str(sdk.get("reason") or "BNB Agent SDK is not ready.")),
            LivePreflightService.check(
                "competition",
                CompetitionRegistrationService.has_stored_registration_proof(str(wallet.get("walletAddress") or "")),
                "Agent wallet is not registered in the competition contract.",
            ),
            LivePreflightService.check("capital", bool(capital.get("ready")), str(capital.get("reason") or "Fund the agent wallet with gas and an in-scope asset.")),
            LivePreflightService.check("cmc_agent_hub", bool(cmc_agent_hub.get("ready")), str(cmc_agent_hub.get("reason") or "CMC Agent Hub MCP tools are not discoverable.")),
            LivePreflightService.check("cmc", LivePreflightService.cmc_ready(cmc), str(cmc.get("reason") or "CMC did not return a live price.")),
            LivePreflightService.check("funded_route", LivePreflightService.funded_cycle_ready(funded_cycle), LivePreflightService.funded_route_reason(funded_strategy, funded_cycle)),
            LivePreflightService.check("live_flags", bool(wallet.get("tradingEnabled")) and bool(wallet.get("allowAgentRun")), "Set BNB_TRADING_ENABLED=true and ALLOW_AGENT_RUN=true.", before_enable=False),
        ]
        signal_reason = CmcSignalConfigService.live_cmc_tool_blocker(
            True,
            str(cmc_agent_hub_signal.get("toolName") or "") if cmc_agent_hub_signal else None,
            cmc_agent_hub_signal,
        )
        checks.insert(
            7,
            LivePreflightService.check(
                "cmc_agent_hub_signal",
                signal_reason is None,
                signal_reason or "Configured CMC Agent Hub signal tool did not return ready.",
            ),
        )
        return checks

    @staticmethod
    def check(name: str, ok: bool, reason: str, before_enable: bool = True) -> dict[str, object]:
        return {
            "name": name,
            "ok": ok,
            "reason": None if ok else reason,
            "requiredBeforeEnable": before_enable,
            "requiredForLiveTrade": True,
        }

    @staticmethod
    def cmc_ready(payload: dict[str, object]) -> bool:
        if not payload.get("configured") or payload.get("reachable") is False:
            return False
        symbols = payload.get("symbols") if isinstance(payload.get("symbols"), dict) else {}
        return any(bool(item.get("priceUsd")) for item in symbols.values() if isinstance(item, dict))

    @staticmethod
    def build_funded_strategy(capital: dict[str, object], cmc: dict[str, object]) -> dict[str, object] | None:
        return FundedStrategyService.build(capital, cmc)

    @staticmethod
    def funded_cycle_ready(payload: dict[str, object]) -> bool:
        quote = payload.get("quote") if isinstance(payload.get("quote"), dict) else {}
        execution = payload.get("execution") if isinstance(payload.get("execution"), dict) else {}
        simulation = execution.get("simulation") if isinstance(execution.get("simulation"), dict) else {}
        transaction = simulation.get("transaction") if isinstance(simulation.get("transaction"), dict) else {}
        return quote.get("quoteSource") == "router" and bool(transaction.get("data"))

    @staticmethod
    def funded_route_reason(strategy: dict[str, object] | None, cycle: dict[str, object]) -> str:
        if not strategy:
            return "No funded route can be derived until CMC prices and wallet balances are ready."
        if cycle.get("_skipped"):
            return "Funded route dry-run skipped for read-only proof bundle; run bnb_live_preflight for full route readiness."
        if cycle.get("_error"):
            return str(cycle["_error"])
        return f"Funded strategy did not build a router transaction: {strategy}"
