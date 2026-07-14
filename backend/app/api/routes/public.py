import asyncio

from fastapi import APIRouter

from app.services.casper.public_proof import CasperPublicProofService


router = APIRouter()


@router.get("/public/proof")
async def public_proof() -> dict[str, object]:
    return await asyncio.to_thread(CasperPublicProofService.get_public_proof, {})
