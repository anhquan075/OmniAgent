from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.logging import configure_logging
from app.core.security_middleware import RequestSecurityMiddleware
from app.core.settings import get_settings
from app.services.agent.autonomous_loop import AutonomousLoopService


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await AutonomousLoopService.start(app)
    try:
        yield
    finally:
        await AutonomousLoopService.stop(app)


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    app = FastAPI(title="OmniAgent BNB FastAPI", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )
    app.add_middleware(RequestSecurityMiddleware)
    app.include_router(api_router, prefix="/api")

    @app.get("/health")
    @app.get("/api/health")
    async def health() -> dict[str, object]:
        return {
            "status": "ok",
            "service": "omniagent-fastapi",
            "network": "bsc",
            "tradingEnabled": settings.bnb_trading_enabled,
            "autonomousLoopEnabled": settings.bnb_autonomous_loop_enabled,
            "autonomousLoop": AutonomousLoopService.get_status(app),
        }

    return app


app = create_app()
