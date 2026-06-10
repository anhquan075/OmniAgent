from dataclasses import dataclass

from app.core.settings import get_settings
from app.services.shared.ledger import TradeLedger

@dataclass(frozen=True)
class TradePolicyInput:
    symbol: str
    side: str
    amount_usd: float
    slippage_bps: int
    signal_source: str | None = None

class RiskPolicyService:
    @staticmethod
    def evaluate_trade_policy(policy_input: TradePolicyInput) -> dict[str, object]:
        settings = get_settings()
        ledger = TradeLedger.get_ledger_summary(limit=25)
        normalized_symbol = policy_input.symbol.upper()
        side = policy_input.side.lower()
        daily = ledger.get("dailyCompliance") or {}
        pnl = ledger.get("pnl") or {}
        reasons: list[str] = []

        if normalized_symbol not in settings.token_allowlist:
            reasons.append("token_not_allowlisted")
        if side not in {"buy", "sell"}:
            reasons.append("unsupported_side")
        if policy_input.amount_usd <= 0:
            reasons.append("amount_must_be_positive")
        if policy_input.amount_usd > settings.bnb_max_trade_usd:
            reasons.append("amount_exceeds_per_trade_limit")
        if policy_input.slippage_bps < 0:
            reasons.append("slippage_must_be_positive")
        if policy_input.slippage_bps > settings.bnb_max_slippage_bps:
            reasons.append("slippage_exceeds_limit")
        if bool((ledger.get("control") or {}).get("emergencyPaused")):
            reasons.append("emergency_pause_enabled")
        if RiskPolicyService.pnl_history_incomplete(pnl):
            reasons.append("pnl_history_incomplete")
        if float(pnl.get("maxDrawdownPct") or 0) >= settings.bnb_max_drawdown_pct:
            reasons.append("drawdown_cap_reached")
        if int(daily.get("todayTradeCount") or 0) >= settings.bnb_max_daily_trades:
            reasons.append("daily_trade_limit_reached")
        if not policy_input.signal_source:
            reasons.append("cmc_signal_required")

        return {
            "approved": not reasons,
            "reasons": reasons,
            "limits": {
                "maxTradeUsd": settings.bnb_max_trade_usd,
                "maxSlippageBps": settings.bnb_max_slippage_bps,
                "maxDrawdownPct": settings.bnb_max_drawdown_pct,
                "maxDailyTrades": settings.bnb_max_daily_trades,
            },
            "observed": {
                "symbol": normalized_symbol,
                "side": side,
                "amountUsd": policy_input.amount_usd,
                "slippageBps": policy_input.slippage_bps,
                "todayTradeCount": int(daily.get("todayTradeCount") or 0),
                "maxDrawdownPct": float(pnl.get("maxDrawdownPct") or 0),
                "pnlStatus": pnl.get("status"),
                "missingPnlTrades": int(pnl.get("missingPnlTrades") or 0),
                "signalSource": policy_input.signal_source,
            },
        }

    @staticmethod
    def pnl_history_incomplete(pnl: dict[str, object]) -> bool:
        status = str(pnl.get("status") or "")
        return (
            pnl.get("available") is False
            or status in {"missing_trade_pnl", "partial"}
            or int(pnl.get("missingPnlTrades") or 0) > 0
        )

    @staticmethod
    def policy_input_from_args(args: dict[str, object], defaults: dict[str, object] | None = None) -> TradePolicyInput:
        merged = {**(defaults or {}), **args}
        return TradePolicyInput(
            symbol=str(merged.get("symbol") or "CAKE"),
            side=str(merged.get("side") or "buy"),
            amount_usd=float(merged.get("amountUsd") or 25),
            slippage_bps=int(merged.get("slippageBps") or 50),
            signal_source=str(merged.get("signalSource") or "") or None,
        )
