import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.logging import configure_logging
from app.core.security_middleware import RequestSecurityMiddleware
from app.core.settings import get_settings
from app.services.casper.loop import agent_loop, loop_state

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
            "capabilities": ["record_decision", "readback", "verify_receipt", "autonomous_loop"],
            "agentLoop": {
                "enabled": settings.casper_agent_loop_enabled,
                "intervalSec": settings.casper_agent_loop_interval_sec,
                "dryRun": settings.casper_agent_loop_dry_run,
                "autoReadback": settings.casper_agent_loop_auto_readback,
            },
        }

    return app


app = create_app()
