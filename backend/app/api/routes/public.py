import asyncio

from fastapi import APIRouter, HTTPException, Query

from app.services.casper.cheat_lab import CasperCheatLabService
from app.services.casper.paid_act import CasperPaidActService
from app.services.casper.public_proof import CasperPublicProofService


router = APIRouter()


@router.get("/public/proof")
async def public_proof() -> dict[str, object]:
    return await asyncio.to_thread(CasperPublicProofService.get_public_proof, {})


@router.get("/public/cheat")
async def public_cheat_catalog() -> dict[str, object]:
    return await asyncio.to_thread(CasperCheatLabService.public_cheat_reverts)


@router.post("/public/cheat/{scenario_id}")
async def public_cheat_run(
    scenario_id: str,
    live: bool = Query(False, description="Submit a live intentional revert when enabled"),
) -> dict[str, object]:
    result = await asyncio.to_thread(
        CasperCheatLabService.run_scenario,
        scenario_id,
        live=live,
    )
    if result.get("status") == "unknown_scenario":
        raise HTTPException(status_code=404, detail="Unknown cheat scenario")
    return result


@router.get("/public/paid-act")
async def public_paid_act_catalog() -> dict[str, object]:
    return await asyncio.to_thread(CasperPaidActService.public_paid_act)


@router.post("/public/paid-act/{step_id}")
async def public_paid_act_run(step_id: str) -> dict[str, object]:
    result = await asyncio.to_thread(CasperPaidActService.run_step, step_id)
    if result.get("status") == "unknown_step":
        raise HTTPException(status_code=404, detail="Unknown paid-act step")
    return result
