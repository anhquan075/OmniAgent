import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.logging import configure_logging
from app.core.security_middleware import RequestSecurityMiddleware
from app.core.settings import get_settings
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.loop import agent_loop, loop_state
from app.services.casper.trust import CasperTrustService

import structlog

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def casper_lifespan(app: FastAPI):
    settings = get_settings()
    task = None
    if settings.casper_agent_loop_enabled:
        loop_state.running = True
        loop_state.interval_sec = settings.casper_agent_loop_interval_sec
        loop_state.dry_run = settings.casper_agent_loop_dry_run
        task = asyncio.create_task(agent_loop())
        app.state.loop_task = task
        logger.info(
            "casper_lifespan_loop_started",
            interval=settings.casper_agent_loop_interval_sec,
            dry_run=settings.casper_agent_loop_dry_run,
            live_submit=settings.casper_live_submit_enabled,
        )
    yield
    if task is not None:
        loop_state.running = False
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        logger.info("casper_lifespan_loop_stopped")


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    app = FastAPI(title="OmniAgent Casper FastAPI", version="0.1.0", lifespan=casper_lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token", "X-Operator-Token"],
    )
    app.add_middleware(RequestSecurityMiddleware)
    app.include_router(api_router, prefix="/api")

    @app.get("/health")
    @app.get("/api/health")
    async def health() -> dict[str, object]:
        return {
            "status": "ok",
            "service": "omniagent-fastapi",
            "network": "casper",
            "liveSubmitEnabled": settings.casper_live_submit_enabled,
            "adapter": settings.agent_runtime_adapter,
        }

    @app.get("/.well-known/casper-agent-card.json")
    async def agent_card() -> dict[str, object]:
        return {
            "name": "OmniAgent Casper Collateral Sentinel",
            "version": "0.1.0",
            "network": settings.casper_network,
            "contractHash": settings.casper_decision_contract_hash,
            "contractPackageHash": settings.casper_decision_contract_package_hash,
            "rpcUrl": settings.casper_rpc_url,
            "explorerUrl": settings.casper_explorer_url,
            "mcpTools": sorted(settings.allowed_tools),
            "protocols": [
                {
                    "id": "mcp",
                    "name": "Model Context Protocol",
                    "endpoint": "/api/mcp",
                    "authentication": "session",
                },
                {
                    "id": "a2a-discovery",
                    "name": "A2A-style Agent Card",
                    "endpoint": "/.well-known/casper-agent-card.json",
                    "authentication": "public",
                },
                {
                    "id": "casper-public-proof",
                    "name": "Public proof packet",
                    "endpoint": "/api/public/proof",
                    "authentication": "public",
                },
                {
                    "id": "dashboard-sse",
                    "name": "Dashboard server-sent event stream",
                    "endpoint": "/api/dashboard/stream?limit=8",
                    "authentication": "session",
                    "channels": ["mcp_activity_log", "ai_output", "proof_bundle"],
                },
            ],
            "endpoints": {
                "publicProof": "/api/public/proof",
                "mcp": "/api/mcp",
                "dashboardStream": "/api/dashboard/stream?limit=8",
            },
            "useCase": {
                "id": "rwa-collateral-nav-risk-receipt",
                "title": "Verifiable RWA collateral risk decisioning",
                "description": (
                    "Autonomous backend loop evaluates public RWA evidence, applies "
                    "proposer/critic/policy guardrails, writes a decision receipt to Casper, "
                    "and verifies readback before exposing public proof."
                ),
            },
            "techStack": [
                "FastAPI autonomous runtime",
                "MCP tool registry",
                "OpenRouter-compatible AI trace adapter",
                "Casper Testnet contract receipt",
                "Server-sent dashboard stream",
                "React proof cockpit",
            ],
            "trustSummary": CasperTrustService.get_trust_summary(
                CasperDecisionLedger.get_ledger_summary(limit=25)["events"],
            ),
            "skills": [
                {
                    "id": "rwa-collateral-risk",
                    "name": "RWA collateral risk decisioning",
                    "inputs": ["public RWA evidence", "policy thresholds"],
                    "outputs": ["decision receipt", "proof digest", "readback verification"],
                },
                {
                    "id": "casper-receipt-verification",
                    "name": "Casper receipt verification",
                    "inputs": ["decision id", "contract hash", "expected proof digest"],
                    "outputs": ["verified readback", "explorer link"],
                },
            ],
            "capabilities": [
                "record_decision",
                "readback",
                "verify_receipt",
                "autonomous_loop",
                "public_proof",
                "stream_mcp_activity",
                "stream_ai_output",
            ],
            "agentLoop": {
                "enabled": settings.casper_agent_loop_enabled,
                "intervalSec": settings.casper_agent_loop_interval_sec,
                "dryRun": settings.casper_agent_loop_dry_run,
                "autoReadback": settings.casper_agent_loop_auto_readback,
            },
        }

    return app


app = create_app()
