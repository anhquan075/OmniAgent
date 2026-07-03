import asyncio

from fastapi import APIRouter, Depends, Request

from app.core.security import require_session, require_operator
from app.core.settings import get_settings
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.loop import agent_loop, get_loop_status, start_loop, stop_loop
from app.services.casper.proof_bundle import CasperProofBundleService
from app.services.casper.readback import CasperReadbackService
from app.services.casper.runtime import CasperAgentRuntimeService


router = APIRouter()


async def _json_body(request: Request) -> dict[str, object]:
    try:
        body = await request.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def _receipt_from_event(event: dict[str, object]) -> dict[str, object | None]:
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    decision = payload.get("decision") if isinstance(payload.get("decision"), dict) else {}
    receipt = decision.get("decisionReceipt") if isinstance(decision.get("decisionReceipt"), dict) else {}
    return {
        "decisionId": decision.get("decisionId"),
        "action": decision.get("action"),
        "riskScore": decision.get("riskScore"),
        "timestamp": decision.get("timestamp"),
        "deployHash": decision.get("deployHash") or decision.get("transactionHash"),
        "proofDigest": decision.get("proofDigest"),
        "rationaleHash": decision.get("rationaleHash"),
        "sourceHash": decision.get("sourceHash"),
        "agentAccountHash": decision.get("agentAccountHash"),
        "guardrailHash": decision.get("guardrailHash"),
        "receiptValue": receipt.get("receiptValue"),
        "policyGate": decision.get("policyGate"),
        "eventType": event.get("eventType"),
        "createdAt": event.get("createdAt"),
    }


@router.get("/dashboard/snapshot", dependencies=[Depends(require_session)])
async def dashboard_snapshot(limit: int = 10) -> dict[str, object]:
    selected_limit = max(1, min(limit, 25))
    runtime, proof_bundle = await asyncio.gather(
        asyncio.to_thread(CasperAgentRuntimeService.get_runtime_snapshot, {"limit": selected_limit}),
        asyncio.to_thread(CasperProofBundleService.get_live_proof_bundle, {"limit": selected_limit}),
    )
    settings = get_settings()
    return {
        "network": "casper",
        "mode": "casper-agentic-buildathon",
        "casperAgentRuntime": {**runtime, "loopStatus": get_loop_status()},
        "casperProofBundle": proof_bundle,
        "backendHealth": {
            "status": "ok",
            "service": "omniagent-fastapi",
            "network": "casper",
            "liveSubmitEnabled": settings.casper_live_submit_enabled,
            "adapter": settings.agent_runtime_adapter,
        },
    }


@router.get("/dashboard/receipts", dependencies=[Depends(require_session)])
async def dashboard_receipts(limit: int = 20) -> dict[str, object]:
    selected_limit = max(1, min(limit, 50))
    ledger = await asyncio.to_thread(CasperDecisionLedger.get_ledger_summary, selected_limit)
    receipts = [
        _receipt_from_event(event)
        for event in ledger.get("events", [])
        if isinstance(event, dict)
    ]
    return {
        "network": "casper",
        "receipts": receipts,
        "count": len(receipts),
    }


@router.get("/dashboard/loop", dependencies=[Depends(require_session)])
async def dashboard_loop() -> dict[str, object]:
    return get_loop_status()


@router.post("/cycle/run", dependencies=[Depends(require_operator)])
async def cycle_run(request: Request) -> dict[str, object]:
    body = await _json_body(request)
    return await asyncio.to_thread(CasperAgentRuntimeService.run_autonomous_cycle, body)


@router.post("/readback/record", dependencies=[Depends(require_operator)])
async def readback_record(request: Request) -> dict[str, object]:
    body = await _json_body(request)
    return await asyncio.to_thread(CasperReadbackService.record_readback, body)


@router.post("/loop/start", dependencies=[Depends(require_operator)])
async def loop_start(request: Request, interval_sec: int = 60, dry_run: bool = True) -> dict[str, object]:
    status = start_loop(interval_sec=interval_sec, dry_run=dry_run)
    task = getattr(request.app.state, "loop_task", None)
    if task is None or task.done():
        request.app.state.loop_task = asyncio.create_task(agent_loop())
    return status


@router.post("/loop/stop", dependencies=[Depends(require_operator)])
async def loop_stop(request: Request) -> dict[str, object]:
    status = stop_loop()
    task = getattr(request.app.state, "loop_task", None)
    if task is not None and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        request.app.state.loop_task = None
    return status
