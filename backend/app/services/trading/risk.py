from datetime import datetime, timezone
from uuid import uuid4

from app.services.shared.ledger import TradeLedger
from app.services.trading.policy import TradePolicyInput
from app.services.trading.policy import RiskPolicyService

class RiskCheckService:
    @staticmethod
    def run_risk_check(
        symbol: str,
        side: str,
        amount_usd: float,
        slippage_bps: int = 50,
        signal_source: str | None = "cmc",
        record_ledger: bool = True,
    ) -> dict[str, object]:
        normalized_symbol = symbol.upper()
        policy = RiskPolicyService.evaluate_trade_policy(TradePolicyInput(
            symbol=normalized_symbol,
            side=side,
            amount_usd=amount_usd,
            slippage_bps=slippage_bps,
            signal_source=signal_source,
        ))
        approved = bool(policy["approved"])
        intent_id = f"intent-{uuid4().hex[:12]}"
        event = {
            "eventType": "risk_checked",
            "tradeIntentId": intent_id,
            "symbol": normalized_symbol,
            "action": side.lower(),
            "payload": {"approved": approved, "amountUsd": amount_usd, "policy": policy},
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        if record_ledger:
            TradeLedger.append_event(event)
        return {
            "network": "bsc",
            "tradeIntentId": intent_id,
            "symbol": normalized_symbol,
            "side": side.lower(),
            "amountUsd": amount_usd,
            "slippageBps": slippage_bps,
            "approved": approved,
            "guardrailsPass": approved,
            "reasons": policy["reasons"],
            "policy": policy,
            **({"ledgerEvent": event} if record_ledger else {}),
        }
