from typing import Any

from app.core.logging import get_logger
from app.core.settings import Settings
from app.services.cmc.prices import CmcPriceService
from app.services.trading.funded_strategy import FundedStrategyService
from app.services.wallet.agent_wallet import AgentWalletService
from app.services.wallet.balances import CapitalReadinessService

logger = get_logger(__name__)


class AutonomousLoopPayloadService:
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

    @classmethod
    async def resolved_cycle_payload(cls, settings: Settings) -> dict[str, Any]:
        payload = cls.cycle_payload(settings)
        if settings.bnb_autonomous_loop_symbol.upper() != "CAKE" or settings.bnb_autonomous_loop_side.lower() != "buy":
            return payload
        try:
            wallet = AgentWalletService.get_wallet_data()
            capital = await CapitalReadinessService.get_capital_readiness(str(wallet.get("walletAddress") or ""))
            cmc = await CmcPriceService.get_price_snapshot(["BNB", "CAKE", "TWT"])
            funded = FundedStrategyService.build(capital, cmc)
        except Exception as error:
            logger.warning("autonomous_loop_funded_strategy_unavailable", error=str(error))
            return payload
        if not funded:
            return payload
        return {
            **payload,
            **funded,
            "execute": settings.bnb_autonomous_loop_execute,
            "recordLedger": True,
            "configuredAmountUsd": settings.bnb_autonomous_loop_amount_usd,
        }
