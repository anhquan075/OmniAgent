import asyncio

from fastapi import APIRouter, HTTPException, Request

from app.core.settings import get_settings
from app.services.casper.x402_endpoint import CasperX402EvidenceEndpointService


router = APIRouter()


@router.get("/x402/rwa-evidence")
async def x402_rwa_evidence(request: Request) -> dict[str, object]:
    settings = get_settings()
    request_url = str(request.url)
    setup = CasperX402EvidenceEndpointService.setup_status(settings, request_url)
    if setup["status"] != "ready":
        raise HTTPException(status_code=503, detail=setup)
    if not getattr(request.state, "payment_payload", None):
        raise HTTPException(
            status_code=402,
            detail={
                "error": "Payment required",
                "provider": "x402",
                "endpoint": setup["endpoint"],
            },
        )
    return await asyncio.to_thread(
        CasperX402EvidenceEndpointService.paid_evidence_payload,
        settings,
        request_url,
    )


@router.get("/x402/setup")
async def x402_setup(request: Request) -> dict[str, object]:
    return CasperX402EvidenceEndpointService.setup_status(get_settings(), str(request.url))
