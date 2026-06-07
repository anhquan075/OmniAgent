from typing import Any


class TradeRecoveryCandidateService:
    @classmethod
    def list_candidates(
        cls,
        *,
        preflight: dict[str, Any] | None = None,
        ledger: dict[str, Any] | None = None,
        receipt: dict[str, Any] | None = None,
        submission: dict[str, Any] | None = None,
        twak_status: dict[str, Any] | None = None,
        competition: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        if isinstance(receipt, dict) and receipt.get("status") == "pending":
            candidates.append(cls._candidate("receipt_pending", "Receipt is pending.", "poll_receipt", submission))
        if isinstance(receipt, dict) and receipt.get("status") == "failed":
            candidates.append(cls._candidate("receipt_failed", "Receipt failed on BSC.", "inspect_receipt", submission))
        if cls._missing_confirmed_receipt(ledger, receipt, submission):
            candidates.append(cls._candidate("ledger_missing_receipt", "Receipt proof exists but ledger confirmation is missing.", "repair_ledger_receipt", submission))
        for blocker in cls._blocker_names(preflight):
            if blocker == "cmc_agent_hub_signal":
                candidates.append(cls._candidate("cmc_signal_stale", "CMC Agent Hub signal is missing or stale.", "refresh_cmc_signal", submission))
            if blocker == "twak":
                candidates.append(cls._candidate("twak_bridge_mismatch", "TWAK bridge is not validated.", "validate_twak_bridge", submission))
            if blocker == "competition":
                candidates.append(cls._candidate("competition_external_tx_missing", "Competition registration proof is missing.", "record_competition_registration", submission))
        if twak_status and twak_status.get("ready") is False:
            candidates.append(cls._candidate("twak_bridge_mismatch", str(twak_status.get("reason") or "TWAK bridge is blocked."), "validate_twak_bridge", submission))
        if competition and competition.get("registered") is False:
            candidates.append(cls._candidate("competition_external_tx_missing", "Competition status is not registered.", "record_competition_registration", submission))
        return cls._dedupe(candidates)

    @staticmethod
    def _candidate(kind: str, reason: str, action: str, submission: dict[str, Any] | None) -> dict[str, Any]:
        return {
            "id": f"{kind}:{(submission or {}).get('tradeIntentId') or (submission or {}).get('txHash') or 'current'}",
            "type": kind,
            "label": kind.replace("_", " "),
            "reason": reason,
            "safeNextAction": action,
            "canSubmitLiveTrade": False,
        }

    @staticmethod
    def _blocker_names(preflight: dict[str, Any] | None) -> list[str]:
        blockers = preflight.get("blockers") if isinstance(preflight, dict) else []
        return [
            str(item.get("name") or "")
            for item in blockers
            if isinstance(item, dict) and not item.get("ok", False)
        ]

    @staticmethod
    def _missing_confirmed_receipt(
        ledger: dict[str, Any] | None,
        receipt: dict[str, Any] | None,
        submission: dict[str, Any] | None,
    ) -> bool:
        if not isinstance(receipt, dict) or receipt.get("status") != "confirmed":
            return False
        proof = receipt.get("proof") if isinstance(receipt.get("proof"), dict) else {}
        if not proof.get("valid"):
            return False
        tx_hash = receipt.get("txHash") or (submission or {}).get("txHash")
        return not any(
            isinstance(event, dict)
            and event.get("eventType") == "trade_receipt_confirmed"
            and event.get("txHash") == tx_hash
            for event in (ledger or {}).get("events") or []
        )

    @staticmethod
    def _dedupe(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[str] = set()
        result: list[dict[str, Any]] = []
        for item in items:
            item_id = str(item.get("id"))
            if item_id not in seen:
                seen.add(item_id)
                result.append(item)
        return result
