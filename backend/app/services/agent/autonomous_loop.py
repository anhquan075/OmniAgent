import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import FastAPI

from app.core.logging import get_logger
from app.core.settings import Settings
from app.core.settings import get_settings
from app.services.agent.autonomous_cycle import AutonomousTradingAgent
from app.services.agent.autonomous_loop_payload import AutonomousLoopPayloadService
from app.services.agent.autonomous_cycle_summary import AutonomousCycleSummary

logger = get_logger(__name__)


class AutonomousLoopService:
    task_state_key = "bnb_autonomous_loop_task"
    status_state_key = "bnb_autonomous_loop_status"
    latest_cycle_state_key = "bnb_autonomous_loop_latest_cycle"

    @classmethod
    async def start(cls, app: FastAPI) -> None:
        settings = get_settings()
        if not settings.bnb_autonomous_loop_enabled:
            status = cls.status_payload(settings, state="disabled")
            cls.set_status(app, status)
            logger.info("autonomous_loop_disabled", **status)
            setattr(app.state, cls.task_state_key, None)
            return
        first_run_at = cls.iso_after(max(settings.bnb_autonomous_loop_initial_delay_sec, 0))
        status = cls.status_payload(
            settings,
            state="active",
            phase="scheduled",
            firstRunAt=first_run_at,
            nextRunAt=first_run_at,
        )
        cls.set_status(app, status)
        task = asyncio.create_task(cls.run_forever(settings, app), name="bnb-autonomous-loop")
        setattr(app.state, cls.task_state_key, task)
        logger.info("autonomous_loop_started", **status)

    @classmethod
    async def stop(cls, app: FastAPI) -> None:
        task = getattr(app.state, cls.task_state_key, None)
        if not task:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            status = cls.status_payload(get_settings(), state="stopped")
            cls.set_status(app, status)
            logger.info("autonomous_loop_stopped", **status)
        setattr(app.state, cls.task_state_key, None)

    @classmethod
    async def run_forever(cls, settings: Settings, app: FastAPI | None = None) -> None:
        initial_delay = max(settings.bnb_autonomous_loop_initial_delay_sec, 0)
        interval = max(settings.bnb_autonomous_loop_interval_sec, 1)
        if initial_delay:
            await asyncio.sleep(initial_delay)
        while True:
            started_at = cls.utc_now().isoformat()
            cls.set_status(
                app,
                cls.status_payload(settings, state="active", phase="running", lastRunAt=started_at),
            )
            try:
                result = await cls.run_once(settings, cycle_started_at=started_at)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                next_run_at = cls.iso_after(interval)
                status = cls.status_payload(
                    settings,
                    state="active",
                    phase="recovering",
                    lastRunAt=started_at,
                    nextRunAt=next_run_at,
                    lastError=str(error),
                )
                cls.set_status(app, status)
                logger.exception("autonomous_loop_cycle_failed", **status)
            else:
                next_run_at = cls.iso_after(interval)
                cls.set_latest_cycle(app, AutonomousCycleSummary.from_result(result))
                status = cls.status_payload(
                    settings,
                    state="active",
                    phase="monitoring",
                    lastRunAt=started_at,
                    nextRunAt=next_run_at,
                    symbol=result.get("symbol") or settings.bnb_autonomous_loop_symbol,
                    side=result.get("side") or settings.bnb_autonomous_loop_side,
                    amountUsd=result.get("amountUsd") or settings.bnb_autonomous_loop_amount_usd,
                    configuredAmountUsd=settings.bnb_autonomous_loop_amount_usd,
                    lastTradeIntentId=result.get("tradeIntentId"),
                    lastStatus=cls.presentation_status(result, settings),
                    lastMode=result.get("mode"),
                    lastTxHash=cls.tx_hash(result),
                )
                cls.set_status(app, status)
            await asyncio.sleep(interval)

    @classmethod
    async def run_once(cls, settings: Settings, cycle_started_at: str | None = None) -> dict[str, object]:
        payload = await cls.resolved_cycle_payload(settings)
        started_at = cycle_started_at or cls.utc_now().isoformat()
        logger.info(
            "autonomous_loop_cycle_started",
            runAt=started_at,
            mode="execute" if payload["execute"] else "dry_run",
            **payload,
        )
        result = await AutonomousTradingAgent.run_autonomous_cycle(payload)
        logger.info(
            "autonomous_loop_cycle_completed",
            runAt=started_at,
            tradeIntentId=result.get("tradeIntentId"),
            status=result.get("status"),
            mode=result.get("mode"),
            txHash=cls.tx_hash(result),
        )
        return result

    @staticmethod
    def cycle_payload(settings: Settings) -> dict[str, Any]:
        return AutonomousLoopPayloadService.cycle_payload(settings)

    @classmethod
    async def resolved_cycle_payload(cls, settings: Settings) -> dict[str, Any]:
        return await AutonomousLoopPayloadService.resolved_cycle_payload(settings)

    @staticmethod
    def utc_now() -> datetime:
        return datetime.now(timezone.utc)

    @classmethod
    def iso_after(cls, seconds: int) -> str:
        return (cls.utc_now() + timedelta(seconds=seconds)).isoformat()

    @staticmethod
    def tx_hash(result: dict[str, object]) -> object:
        execution = result.get("execution") if isinstance(result.get("execution"), dict) else {}
        ledger_event = execution.get("ledgerEvent") if isinstance(execution.get("ledgerEvent"), dict) else {}
        return result.get("txHash") or execution.get("txHash") or ledger_event.get("txHash")

    @staticmethod
    def presentation_status(result: dict[str, object], settings: Settings) -> str:
        status = str(result.get("status") or "").lower()
        if status in {"submitted", "settled", "confirmed", "executed", "ready"}:
            return status
        if not settings.bnb_autonomous_loop_execute:
            return "monitoring"
        return "guarded"

    @staticmethod
    def set_status(app: FastAPI | None, status: dict[str, object]) -> None:
        if app is not None:
            setattr(app.state, AutonomousLoopService.status_state_key, status)

    @staticmethod
    def set_latest_cycle(app: FastAPI | None, cycle: dict[str, object]) -> None:
        if app is not None:
            setattr(app.state, AutonomousLoopService.latest_cycle_state_key, cycle)

    @staticmethod
    def get_latest_cycle(app: FastAPI) -> dict[str, object]:
        cycle = getattr(app.state, AutonomousLoopService.latest_cycle_state_key, None)
        return cycle if isinstance(cycle, dict) else {}

    @staticmethod
    def get_status(app: FastAPI) -> dict[str, object]:
        status = getattr(app.state, AutonomousLoopService.status_state_key, None)
        if isinstance(status, dict):
            return status
        return AutonomousLoopService.status_payload(get_settings(), state="unknown")

    @staticmethod
    def status_payload(settings: Settings, state: str, **updates: object) -> dict[str, object]:
        return {
            "state": state,
            "enabled": settings.bnb_autonomous_loop_enabled,
            "execute": settings.bnb_autonomous_loop_execute,
            "mode": "execute" if settings.bnb_autonomous_loop_execute else "dry_run",
            "symbol": settings.bnb_autonomous_loop_symbol,
            "side": settings.bnb_autonomous_loop_side,
            "amountUsd": settings.bnb_autonomous_loop_amount_usd,
            "slippageBps": settings.bnb_autonomous_loop_slippage_bps,
            "initialDelaySec": max(settings.bnb_autonomous_loop_initial_delay_sec, 0),
            "intervalSec": max(settings.bnb_autonomous_loop_interval_sec, 1),
            **updates,
        }
