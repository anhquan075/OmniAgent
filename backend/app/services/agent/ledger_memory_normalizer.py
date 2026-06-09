from typing import Any


class LedgerMemoryNormalizer:
    @staticmethod
    def is_guarded(preflight: dict[str, Any], proof_bundle: dict[str, Any]) -> bool:
        if preflight.get("readyForLiveTrade") is not True:
            return True
        proof_score = proof_bundle.get("proofScore") if isinstance(proof_bundle.get("proofScore"), dict) else {}
        return bool(proof_score.get("hardBlocked") or proof_score.get("hardBlockers"))

    @staticmethod
    def is_synthetic_event(event: dict[str, Any]) -> bool:
        return str(event.get("tradeIntentId") or "") == "intent-test"

    @staticmethod
    def safe_action_label(action: str, guarded: bool) -> str:
        normalized = action.strip().lower()
        if guarded and normalized in {"execute_trade", "trade", "buy", "sell"}:
            return "safety_hold"
        return normalized or "observe"

    @staticmethod
    def reason_parts(value: object) -> list[str]:
        raw = str(value or "").replace("\n", ";")
        parts = [part.strip() for part in raw.split(";")]
        return [LedgerMemoryNormalizer.human_reason(part) for part in parts if part.strip()]

    @staticmethod
    def human_reason(reason: str) -> str:
        return {
            "funded_route": "Router-backed funded route is not ready.",
            "router_quote_valid": "Router quote is not valid yet.",
            "emergency_pause": "Emergency pause is enabled.",
            "emergency_pause_enabled": "Emergency pause is enabled.",
            "cmc_signal_required": "Server-verified CMC signal is required.",
            "agent wallet is not configured": "Agent wallet is not configured.",
            "Agent wallet address is not configured": "Agent wallet address is not configured.",
            "BNB live trading is disabled": "BNB live trading is disabled.",
            "ALLOW_AGENT_RUN is false": "ALLOW_AGENT_RUN is false.",
            "router-backed transaction is required": "Router-backed transaction is required.",
        }.get(reason, reason)
