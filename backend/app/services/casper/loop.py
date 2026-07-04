import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

from app.core.settings import get_settings
from app.services.casper.readback import CasperReadbackService
from app.services.casper.rwa_evidence import fetch_treasury_yield
from app.services.casper.runtime import CasperAgentRuntimeService
from app.services.casper.submitter import CasperCliSubmitter


logger = structlog.get_logger(__name__)
MAX_CONSECUTIVE_ERRORS = 5


@dataclass
class LoopState:
    running: bool = False
    interval_sec: int = 60
    dry_run: bool = False
    cycle_in_progress: bool = False
    last_cycle_at: str | None = None
    next_cycle_at: str | None = None
    cycle_count: int = 0
    error_count: int = 0
    consecutive_errors: int = 0
    last_error: str | None = None
    last_decision_id: str | None = None
    last_deploy_hash: str | None = None
    last_deploy_status: str | None = None
    last_readback_verified: bool | None = None
    last_readback_at: str | None = None


loop_state = LoopState()


def get_loop_status() -> dict[str, Any]:
    settings = get_settings()
    return {
        "network": "casper",
        "automationOwner": "backend",
        "liveSubmitEnabled": settings.casper_live_submit_enabled,
        "autoReadback": settings.casper_agent_loop_auto_readback,
        "running": loop_state.running,
        "intervalSec": loop_state.interval_sec,
        "dryRun": loop_state.dry_run,
        "cycleInProgress": loop_state.cycle_in_progress,
        "lastCycleAt": loop_state.last_cycle_at,
        "nextCycleAt": loop_state.next_cycle_at,
        "cycleCount": loop_state.cycle_count,
        "errorCount": loop_state.error_count,
        "lastError": loop_state.last_error,
        "lastDecisionId": loop_state.last_decision_id,
        "lastDeployHash": loop_state.last_deploy_hash,
        "lastDeployStatus": loop_state.last_deploy_status,
        "lastReadbackVerified": loop_state.last_readback_verified,
        "lastReadbackAt": loop_state.last_readback_at,
    }


def start_loop(interval_sec: int = 60, dry_run: bool = False) -> dict[str, Any]:
    loop_state.running = True
    loop_state.interval_sec = interval_sec
    loop_state.dry_run = dry_run
    loop_state.consecutive_errors = 0
    loop_state.next_cycle_at = datetime.now(timezone.utc).isoformat()
    return get_loop_status()


def stop_loop() -> dict[str, Any]:
    loop_state.running = False
    loop_state.next_cycle_at = None
    return get_loop_status()


async def poll_deploy_status(deploy_hash: str) -> str:
    settings = get_settings()
    for _ in range(settings.casper_agent_loop_poll_max_retries):
        status_result = await asyncio.to_thread(
            CasperCliSubmitter.get_transaction_status, deploy_hash,
        )
        if status_result.get("status") == "confirmed":
            return "confirmed"
        await asyncio.sleep(settings.casper_agent_loop_poll_interval_sec)
    return "unconfirmed"


async def auto_readback(decision_id: str, deploy_hash: str) -> dict[str, Any] | None:
    try:
        return await asyncio.to_thread(
            CasperReadbackService.record_readback,
            {"decisionId": decision_id, "deployHash": deploy_hash},
        )
    except Exception as exc:
        logger.error("casper_agent_loop_readback_error", error=str(exc)[:200])
        return None


async def agent_loop() -> None:
    logger.info("casper_agent_loop_started", interval=loop_state.interval_sec, dry_run=loop_state.dry_run)
    while loop_state.running:
        loop_state.next_cycle_at = None
        loop_state.cycle_in_progress = True
        try:
            evidence = await fetch_treasury_yield()
            decision_id = f"rwa-collateral-{loop_state.cycle_count:04d}"
            cycle_args: dict[str, Any] = {
                "decisionId": decision_id,
                "evidence": evidence,
            }
            if not loop_state.dry_run:
                cycle_args["submit"] = True
                cycle_args["iUnderstandThisSubmitsCasperTestnet"] = True
            timeout = get_settings().casper_agent_loop_cycle_timeout_sec
            result = await asyncio.wait_for(
                asyncio.to_thread(CasperAgentRuntimeService.run_autonomous_cycle, cycle_args),
                timeout=timeout,
            )
            loop_state.cycle_count += 1
            loop_state.consecutive_errors = 0
            loop_state.last_cycle_at = datetime.now(timezone.utc).isoformat()
            loop_state.last_decision_id = decision_id
            loop_state.last_error = None
            deploy_hash = result.get("deployHash") or result.get("transactionHash")
            if deploy_hash:
                loop_state.last_deploy_hash = deploy_hash
                loop_state.last_deploy_status = None
                loop_state.last_readback_verified = None
                loop_state.last_readback_at = None
            logger.info("casper_agent_loop_cycle", decision_id=decision_id, status=result.get("status"))
            if deploy_hash and not loop_state.dry_run and get_settings().casper_agent_loop_auto_readback:
                try:
                    deploy_status = await poll_deploy_status(str(deploy_hash))
                    loop_state.last_deploy_status = deploy_status
                    if deploy_status == "confirmed":
                        readback_result = await auto_readback(decision_id, str(deploy_hash))
                        loop_state.last_readback_verified = bool(
                            readback_result and readback_result.get("verified")
                        )
                        loop_state.last_readback_at = datetime.now(timezone.utc).isoformat()
                        logger.info(
                            "casper_agent_loop_readback",
                            verified=loop_state.last_readback_verified,
                        )
                    else:
                        loop_state.last_readback_verified = False
                except Exception as exc:
                    loop_state.last_deploy_status = "poll_or_readback_error"
                    loop_state.last_readback_verified = False
                    loop_state.last_readback_at = datetime.now(timezone.utc).isoformat()
                    logger.error("casper_agent_loop_auto_readback_error", error=str(exc)[:200])
        except asyncio.TimeoutError:
            loop_state.error_count += 1
            loop_state.consecutive_errors += 1
            loop_state.last_error = f"cycle_timeout_after_{get_settings().casper_agent_loop_cycle_timeout_sec}s"
            logger.error("casper_agent_loop_timeout", consecutive=loop_state.consecutive_errors)
            if loop_state.consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                loop_state.running = False
                logger.error("casper_agent_loop_auto_paused", errors=loop_state.consecutive_errors)
                break
        except Exception as exc:
            loop_state.error_count += 1
            loop_state.consecutive_errors += 1
            loop_state.last_error = str(exc)[:200]
            logger.error("casper_agent_loop_error", error=str(exc)[:200], consecutive=loop_state.consecutive_errors)
            if loop_state.consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                loop_state.running = False
                logger.error("casper_agent_loop_auto_paused", errors=loop_state.consecutive_errors)
                break
        finally:
            loop_state.cycle_in_progress = False
            if loop_state.running:
                loop_state.next_cycle_at = (
                    datetime.now(timezone.utc) + timedelta(seconds=loop_state.interval_sec)
                ).isoformat()
        await asyncio.sleep(loop_state.interval_sec)
    logger.info("casper_agent_loop_stopped")
