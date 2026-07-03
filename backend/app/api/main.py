from fastapi import APIRouter

from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.mcp import router as mcp_router
from app.api.routes.public import router as public_router
from app.api.routes.session import router as session_router


api_router = APIRouter()
api_router.include_router(session_router)
api_router.include_router(public_router)
api_router.include_router(dashboard_router)
api_router.include_router(mcp_router)
