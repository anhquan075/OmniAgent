import asyncio
from typing import Any

from fastapi import FastAPI
from loguru import logger

from app.core.settings import Settings
from app.core.settings import get_settings
from app.services.agent.autonomous_cycle import AutonomousTradingAgent


class AutonomousLoopService:
    task_state_key = "bnb_autonomous_loop_task"

    @classmethod
    async def start(cls, app: FastAPI) -> None:
        settings = get_settings()
        if not settings.bnb_autonomous_loop_enabled:
            logger.info("backend autonomous loop disabled")
            setattr(app.state, cls.task_state_key, None)
            return
        task = asyncio.create_task(cls.run_forever(settings), name="bnb-autonomous-loop")
        setattr(app.state, cls.task_state_key, task)
        logger.info(
            "backend autonomous loop started symbol={} side={} amountUsd={} execute={} intervalSec={}",
            settings.bnb_autonomous_loop_symbol,
            settings.bnb_autonomous_loop_side,
            settings.bnb_autonomous_loop_amount_usd,
            settings.bnb_autonomous_loop_execute,
            settings.bnb_autonomous_loop_interval_sec,
        )

    @classmethod
    async def stop(cls, app: FastAPI) -> None:
        task = getattr(app.state, cls.task_state_key, None)
        if not task:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            logger.info("backend autonomous loop stopped")
        setattr(app.state, cls.task_state_key, None)

    @classmethod
    async def run_forever(cls, settings: Settings) -> None:
        initial_delay = max(settings.bnb_autonomous_loop_initial_delay_sec, 0)
        interval = max(settings.bnb_autonomous_loop_interval_sec, 1)
        if initial_delay:
            await asyncio.sleep(initial_delay)
        while True:
            try:
                await cls.run_once(settings)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.exception("backend autonomous loop cycle failed: {}", error)
            await asyncio.sleep(interval)

    @classmethod
    async def run_once(cls, settings: Settings) -> dict[str, object]:
        payload = cls.cycle_payload(settings)
        result = await AutonomousTradingAgent.run_autonomous_cycle(payload)
        logger.info(
            "backend autonomous loop cycle completed intent={} status={} mode={}",
            result.get("tradeIntentId"),
            result.get("status"),
            result.get("mode"),
        )
        return result

    @staticmethod
    def cycle_payload(settings: Settings) -> dict[str, Any]:
        return {
            "symbol": settings.bnb_autonomous_loop_symbol,
            "side": settings.bnb_autonomous_loop_side,
            "amountUsd": settings.bnb_autonomous_loop_amount_usd,
            "slippageBps": settings.bnb_autonomous_loop_slippage_bps,
            "signalSource": "cmc",
            "execute": settings.bnb_autonomous_loop_execute,
            "recordLedger": True,
        }
