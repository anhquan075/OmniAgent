"""x402 evidence routes — Casper-native paywall."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.core.settings import get_settings
from app.services.casper.casper_x402_facilitator import gate_payment, read_payment_header
from app.services.casper.x402_endpoint import CasperX402EvidenceEndpointService


router = APIRouter()


@router.get("/x402/rwa-evidence")
async def x402_rwa_evidence(request: Request) -> Response:
    settings = get_settings()
    request_url = str(request.url)
    cfg = CasperX402EvidenceEndpointService.config_from_settings(settings)
    setup = CasperX402EvidenceEndpointService.setup_status(settings, request_url)

    # Must be able to emit a Casper price tag (payTo + asset + casper: network).
    if not cfg.configured:
        return JSONResponse(status_code=503, content=setup)

    resource = str(settings.casper_x402_evidence_url or request_url)
    payment_header = read_payment_header(request.headers)
    settlement, error_body, error_headers = await gate_payment(
        cfg=cfg,
        resource=resource,
        payment_header=payment_header,
    )
    if error_body is not None:
        return JSONResponse(
            status_code=402,
            content=error_body,
            headers=error_headers or {},
        )

    assert settlement is not None
    payload = await asyncio.to_thread(
        CasperX402EvidenceEndpointService.paid_evidence_payload,
        settings,
        request_url,
        settlement={
            "success": settlement.success,
            "transaction": settlement.transaction,
            "network": settlement.network,
            "payer": settlement.payer,
            "explorerUrl": (
                f"{settings.casper_explorer_url.rstrip('/')}/transaction/{settlement.transaction}"
                if settlement.transaction
                else None
            ),
        },
    )
    return JSONResponse(
        status_code=200,
        content=payload,
        headers={
            "X-PAYMENT-RESPONSE": settlement.response_header(),
            "Payment-Response": settlement.response_header(),
            "Access-Control-Expose-Headers": "X-PAYMENT-RESPONSE, Payment-Response, PAYMENT-REQUIRED",
        },
    )


@router.get("/x402/setup")
async def x402_setup(request: Request) -> dict[str, object]:
    return CasperX402EvidenceEndpointService.setup_status(get_settings(), str(request.url))
