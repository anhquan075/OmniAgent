from decimal import Decimal, ROUND_DOWN

from app.core.settings import get_settings
from app.services.trading.token_registry import TOKEN_REGISTRY


class FundedStrategyService:
    @staticmethod
    def build(capital: dict[str, object], cmc: dict[str, object]) -> dict[str, object] | None:
        candidates = [
            FundedStrategyService.usdt_buy_strategy(capital),
            FundedStrategyService.bnb_sell_strategy(capital, cmc),
        ]
        viable = [candidate for candidate in candidates if candidate]
        return max(viable, key=FundedStrategyService.amount_usd) if viable else None

    @staticmethod
    def usdt_buy_strategy(capital: dict[str, object]) -> dict[str, object] | None:
        usdt = FundedStrategyService.balance(capital, "USDT")
        amount_usd = FundedStrategyService.spendable_amount(usdt, "USDT")
        if amount_usd is None:
            return None
        return {
            "symbol": "CAKE",
            "side": "buy",
            "amountUsd": float(amount_usd),
            "slippageBps": FundedStrategyService.slippage_bps(),
            "signalSource": "cmc",
        }

    @staticmethod
    def bnb_sell_strategy(capital: dict[str, object], cmc: dict[str, object]) -> dict[str, object] | None:
        bnb = FundedStrategyService.balance(capital, "BNB")
        bnb_price = FundedStrategyService.price_usd(cmc, "BNB")
        if not bnb or not bnb_price:
            return None
        spendable = Decimal(int(str(bnb.get("spendableRaw") or "0"))) / (Decimal(10) ** TOKEN_REGISTRY["BNB"].decimals)
        amount_usd = FundedStrategyService.cap_amount(spendable * Decimal(str(bnb_price)) * Decimal("0.5"))
        if amount_usd is None:
            return None
        return {
            "symbol": "BNB",
            "side": "sell",
            "amountUsd": float(min(Decimal("0.25"), amount_usd)),
            "slippageBps": FundedStrategyService.slippage_bps(),
            "signalSource": "cmc",
        }

    @staticmethod
    def balance(capital: dict[str, object], symbol: str) -> dict[str, object] | None:
        balances = capital.get("balances") if isinstance(capital.get("balances"), list) else []
        return next((item for item in balances if isinstance(item, dict) and item.get("symbol") == symbol), None)

    @staticmethod
    def spendable_amount(balance: dict[str, object] | None, symbol: str) -> Decimal | None:
        if not balance:
            return None
        token = TOKEN_REGISTRY[symbol]
        spendable = Decimal(int(str(balance.get("spendableRaw") or balance.get("raw") or "0"))) / (Decimal(10) ** token.decimals)
        return FundedStrategyService.cap_amount(spendable)

    @staticmethod
    def cap_amount(amount_usd: Decimal) -> Decimal | None:
        settings = get_settings()
        max_amount = Decimal(str(min(settings.bnb_autonomous_loop_amount_usd, settings.bnb_max_trade_usd)))
        capped = min(amount_usd, max_amount).quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
        return capped if capped > 0 else None

    @staticmethod
    def slippage_bps() -> int:
        settings = get_settings()
        return min(settings.bnb_autonomous_loop_slippage_bps, settings.bnb_max_slippage_bps)

    @staticmethod
    def amount_usd(strategy: dict[str, object]) -> float:
        return float(strategy.get("amountUsd") or 0)

    @staticmethod
    def price_usd(cmc: dict[str, object], symbol: str) -> float | None:
        symbols = cmc.get("symbols") if isinstance(cmc.get("symbols"), dict) else {}
        item = symbols.get(symbol) if isinstance(symbols, dict) else None
        value = item.get("priceUsd") if isinstance(item, dict) else None
        return float(value) if isinstance(value, int | float) and value > 0 else None
