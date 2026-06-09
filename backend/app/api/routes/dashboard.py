import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.security import require_session
from app.core.settings import get_settings
from app.services.agent.autonomous_loop import AutonomousLoopService
from app.services.agent.cockpit import AgentCockpitService
from app.services.cmc.daily_market_overview import CmcDailyMarketOverviewService
from app.services.shared.trade_history import TradeHistoryService
from app.services.trading.live_preflight import LivePreflightService
from app.services.trading.proof_bundle import ProofBundleService


router = APIRouter()


@router.get("/dashboard/snapshot", dependencies=[Depends(require_session)])
async def dashboard_snapshot(request: Request, limit: int = 10) -> dict[str, object]:
    selected_limit = max(1, min(limit, 25))
    cockpit, preflight, proof_bundle = await asyncio.gather(
        AgentCockpitService.get_cockpit_snapshot(limit=selected_limit),
        LivePreflightService.get_live_preflight({}),
        ProofBundleService.get_live_proof_bundle({"limit": selected_limit}),
        return_exceptions=True,
    )
    if isinstance(cockpit, Exception):
        raise HTTPException(status_code=503, detail=f"Dashboard snapshot unavailable: {cockpit}")

    settings = get_settings()
    snapshot = dict(cockpit)
    snapshot["livePreflight"] = (
        unavailable("preflight", preflight) if isinstance(preflight, Exception) else preflight
    )
    snapshot["liveProofBundle"] = (
        unavailable("proof_bundle", proof_bundle) if isinstance(proof_bundle, Exception) else proof_bundle
    )
    snapshot["backendHealth"] = {
        "status": "ok",
        "service": "omniagent-fastapi",
        "network": "bsc",
        "tradingEnabled": settings.bnb_trading_enabled,
        "autonomousLoopEnabled": settings.bnb_autonomous_loop_enabled,
        "autonomousLoop": AutonomousLoopService.get_status(request.app),
    }
    return snapshot


@router.get("/dashboard/trades", dependencies=[Depends(require_session)])
async def dashboard_trades(limit: int = 100, offset: int = 0) -> dict[str, object]:
    return TradeHistoryService.get_executed_trades(limit=limit, offset=offset)


@router.post("/dashboard/cmc-daily-market-overview", dependencies=[Depends(require_session)])
async def dashboard_cmc_daily_market_overview() -> dict[str, object]:
    return await CmcDailyMarketOverviewService.run({"preview": True, "recordLedger": True})


def unavailable(name: str, error: Exception) -> dict[str, object]:
    return {
        "status": "unavailable",
        "readyForLiveTrade": False,
        "blockers": [{"name": name, "reason": str(error)}],
    }
