from datetime import datetime, timezone
from typing import Any

from app.core.settings import get_settings
from app.services.agent.backtest_report import BacktestRiskReportService
from app.services.agent.cockpit import AgentCockpitService
from app.services.agent.identity import BnbAgentIdentityService
from app.services.agent.ledger_memory import LedgerMemoryService
from app.services.agent.runtime_core_agent import BnbAgentCoreRuntimeAdvisor
from app.services.agent.sdk_runtime import BnbAgentSdkRuntimeService
from app.services.agent.status import BnbAgentStatusService
from app.services.agent.strategy_research import StrategyResearchService
from app.services.shared.ledger import TradeLedger
from app.services.trading.live_preflight import LivePreflightService
from app.services.trading.proof_bundle import ProofBundleService


class BnbAgentRuntimeService:
    @staticmethod
    async def get_runtime_snapshot(args: dict[str, object] | None = None) -> dict[str, object]:
        args = args or {}
        limit = int(args.get("limit") or 25)
        cockpit = await AgentCockpitService.get_cockpit_snapshot(limit=limit)
        preflight = await LivePreflightService.get_live_preflight({"skipFundedCycle": True})
        proof_bundle = await ProofBundleService.get_live_proof_bundle({"limit": limit})
        core_agent = await BnbAgentCoreRuntimeAdvisor.evaluate(cockpit, preflight)
        return BnbAgentRuntimeService.build_runtime_snapshot(cockpit, preflight, proof_bundle, core_agent)

    @staticmethod
    def build_runtime_snapshot(
        cockpit: dict[str, Any],
        preflight: dict[str, Any],
        proof_bundle: dict[str, Any],
        cycle: dict[str, Any] | None,
    ) -> dict[str, object]:
        ledger = cockpit.get("ledger") if isinstance(cockpit.get("ledger"), dict) else TradeLedger.get_ledger_summary(limit=25)
        sdk_status = cockpit.get("sdkStatus") if isinstance(cockpit.get("sdkStatus"), dict) else BnbAgentStatusService.get_agent_sdk_status_dict()
        wallet = cockpit.get("wallet") if isinstance(cockpit.get("wallet"), dict) else {}
        sdk_runtime = BnbAgentSdkRuntimeService.get_facade_snapshot(str(wallet.get("walletAddress") or ""), sdk_status)
        memory = LedgerMemoryService.build(ledger, preflight, proof_bundle, cycle)
        report = BacktestRiskReportService.build(ledger, proof_bundle)
        research = StrategyResearchService.build(cockpit, preflight, proof_bundle, memory)
        core_agent = BnbAgentRuntimeService.core_agent_summary(cycle)
        return {
            "network": "bsc",
            "role": "runtime_core",
            "sdkRole": "runtime_core",
            "executor": "twak",
            "sdkExecutesTrades": False,
            "executorBoundary": "BNB Agent SDK provides identity, profile, status, and memory surfaces; TWAK signs and submits trades.",
            "sdkStatus": sdk_status,
            "sdkRuntime": sdk_runtime,
            "agentProfile": BnbAgentRuntimeService.agent_profile(cockpit, sdk_status, sdk_runtime),
            "identityRegistration": BnbAgentRuntimeService.identity_registration(sdk_status),
            "coreAgent": core_agent,
            "openRouterAdvisor": core_agent.get("strategyDecision", {}).get("advisor") if isinstance(core_agent.get("strategyDecision"), dict) else {},
            "ledgerMemory": memory,
            "strategyResearch": research,
            "backtestRiskReport": report,
            "liveReadiness": preflight,
            "proofScore": proof_bundle.get("proofScore"),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def core_agent_summary(cycle: dict[str, Any] | None) -> dict[str, object]:
        settings = get_settings()
        strategy = cycle.get("strategyDecision") if isinstance(cycle, dict) and isinstance(cycle.get("strategyDecision"), dict) else {}
        advisor = strategy.get("advisor") if isinstance(strategy.get("advisor"), dict) else {}
        decision = strategy.get("decision") if isinstance(strategy.get("decision"), dict) else {}
        source = str(strategy.get("source") or "monitoring")
        return {
            "provider": "openrouter",
            "runtimeRole": "agent_core",
            "called": bool(advisor) or source == "openrouter",
            "ready": bool(advisor.get("ready")) if advisor else source == "openrouter",
            "model": advisor.get("model") or settings.openrouter_model,
            "reason": advisor.get("reason"),
            "strategyDecision": strategy,
            "decision": decision,
        }

    @staticmethod
    async def get_ledger_memory(args: dict[str, object] | None = None) -> dict[str, object]:
        snapshot = await BnbAgentRuntimeService.get_runtime_snapshot(args)
        return {"network": "bsc", **snapshot["ledgerMemory"]}  # type: ignore[arg-type]

    @staticmethod
    async def get_strategy_research(args: dict[str, object] | None = None) -> dict[str, object]:
        snapshot = await BnbAgentRuntimeService.get_runtime_snapshot(args)
        return {"network": "bsc", **snapshot["strategyResearch"]}  # type: ignore[arg-type]

    @staticmethod
    async def get_backtest_report(args: dict[str, object] | None = None) -> dict[str, object]:
        snapshot = await BnbAgentRuntimeService.get_runtime_snapshot(args)
        return {"network": "bsc", **snapshot["backtestRiskReport"]}  # type: ignore[arg-type]

    @staticmethod
    def agent_profile(cockpit: dict[str, Any], sdk_status: dict[str, Any], sdk_runtime: dict[str, Any]) -> dict[str, object]:
        settings = get_settings()
        wallet = cockpit.get("wallet") if isinstance(cockpit.get("wallet"), dict) else {}
        agent_uri = BnbAgentRuntimeService.agent_uri(wallet)
        return {
            "name": "OmniAgent BNB Trader",
            "walletAddress": wallet.get("walletAddress"),
            "publicEndpoint": settings.bnb_agent_public_endpoint,
            "registryAddress": sdk_status.get("registryAddress"),
            "agentUriGenerated": bool(agent_uri),
            "agentUriPreview": f"{agent_uri[:96]}..." if agent_uri and len(agent_uri) > 96 else agent_uri,
            "capabilities": [
                {"name": "bnbagent_facade", "provider": "bnbagent", "ready": bool(sdk_runtime.get("facadeInitialized"))},
                {"name": "erc8004_identity", "provider": "bnbagent", "ready": bool(sdk_status.get("ready"))},
                {
                    "name": "erc8183_protocol",
                    "provider": "bnbagent",
                    "ready": "erc8183" in (sdk_runtime.get("modulesInitialized") or []),
                },
                {"name": "ledger_memory", "provider": "omniagent", "ready": True},
                {"name": "cmc_signal", "provider": "coinmarketcap", "ready": bool((cockpit.get("prices") or {}).get("configured"))},
                {"name": "twak_execution", "provider": "twak", "ready": bool((cockpit.get("twakStatus") or {}).get("ready"))},
            ],
        }

    @staticmethod
    def identity_registration(sdk_status: dict[str, Any]) -> dict[str, object]:
        return {
            "enabled": bool(sdk_status.get("registrationEnabled")),
            "ready": bool(
                sdk_status.get("ready")
                and sdk_status.get("registrationEnabled")
                and sdk_status.get("privateKeyConfigured")
                and sdk_status.get("walletPasswordConfigured")
            ),
            "liveSubmissionGated": True,
            "reason": None if sdk_status.get("registrationEnabled") else "BNB Agent SDK registration flag is off.",
        }

    @staticmethod
    def agent_uri(wallet: dict[str, Any]) -> str | None:
        wallet_address = str(wallet.get("walletAddress") or "")
        if not wallet_address:
            return None
        try:
            return BnbAgentIdentityService._generate_agent_uri({"walletAddress": wallet_address})
        except (ImportError, ValueError, TypeError, AttributeError):
            return None
