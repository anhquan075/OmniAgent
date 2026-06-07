from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.logging import configure_logging
from app.core.settings import get_settings


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    app = FastAPI(title="OmniAgent BNB FastAPI", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )
    app.include_router(api_router, prefix="/api")

    @app.get("/health")
    @app.get("/api/health")
    async def health() -> dict[str, object]:
        return {
            "status": "ok",
            "service": "omniagent-fastapi",
            "network": "bsc",
            "tradingEnabled": settings.bnb_trading_enabled,
        }

    return app


app = create_app()
