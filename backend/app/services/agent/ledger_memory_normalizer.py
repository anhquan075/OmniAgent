from typing import Any


class LedgerMemoryNormalizer:
    @staticmethod
    def is_guarded(preflight: dict[str, Any], proof_bundle: dict[str, Any]) -> bool:
        if preflight.get("readyForLiveTrade") is not True:
            return True
        return bool(LedgerMemoryNormalizer.active_hard_blockers(preflight, proof_bundle))

    @staticmethod
    def is_synthetic_event(event: dict[str, Any]) -> bool:
        return str(event.get("tradeIntentId") or "") == "intent-test"

    @staticmethod
    def active_hard_blockers(preflight: dict[str, Any], proof_bundle: dict[str, Any]) -> list[str]:
        proof_score = proof_bundle.get("proofScore") if isinstance(proof_bundle.get("proofScore"), dict) else {}
        blockers = proof_score.get("hardBlockers") if isinstance(proof_score.get("hardBlockers"), list) else []
        return [
            str(blocker) for blocker in blockers
            if not LedgerMemoryNormalizer.preflight_clears_blocker(preflight, str(blocker))
        ]

    @staticmethod
    def preflight_clears_blocker(preflight: dict[str, Any], blocker: str) -> bool:
        if preflight.get("readyForLiveTrade") is not True:
            return False
        check_name = {"router_quote_valid": "funded_route"}.get(blocker, blocker)
        checks = preflight.get("checks") if isinstance(preflight.get("checks"), list) else []
        return any(
            isinstance(item, dict) and item.get("name") == check_name and item.get("ok") is True
            for item in checks
        )

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
