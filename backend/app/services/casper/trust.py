from __future__ import annotations

from typing import Any


class CasperTrustService:
    """Aggregate public-safe trust metrics from verified receipt history."""

    @staticmethod
    def get_trust_summary(events: object, *, min_samples: int = 3) -> dict[str, Any]:
        selected = [
            CasperTrustService._decision_record_from_event(event)
            for event in events
            if isinstance(event, dict)
        ]
        records = [record for record in selected if record]
        total = len(records)
        verified = sum(1 for record in records if CasperTrustService._readback_verified(record))
        blocked = sum(1 for record in records if record["decision"].get("policyGate") == "blocked")
        stale = sum(1 for record in records if CasperTrustService._has_blocker(record["decision"], "rwa_evidence_stale"))
        paid_verified = sum(1 for record in records if (record["decision"].get("x402") or {}).get("status") == "verified")
        sufficient = total >= min_samples
        return {
            "status": "measured" if sufficient else "insufficient_data",
            "sampleSize": total,
            "minSampleSize": min_samples,
            "verifiedReadbackRate": CasperTrustService._rate(verified, total),
            "policyBlockedRate": CasperTrustService._rate(blocked, total),
            "staleEvidenceRate": CasperTrustService._rate(stale, total),
            "paidEvidenceVerifiedRate": CasperTrustService._rate(paid_verified, total),
            "components": {
                "verifiedReadbacks": verified,
                "policyBlockedDecisions": blocked,
                "staleEvidenceDecisions": stale,
                "paidEvidenceVerifiedDecisions": paid_verified,
            },
        }

    @staticmethod
    def _decision_from_event(event: dict[str, Any]) -> dict[str, Any]:
        return CasperTrustService._decision_record_from_event(event).get("decision", {})

    @staticmethod
    def _decision_record_from_event(event: dict[str, Any]) -> dict[str, Any]:
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        decision = payload.get("decision") if isinstance(payload.get("decision"), dict) else {}
        if not decision:
            return {}
        return {"event": event, "payload": payload, "decision": decision}

    @staticmethod
    def _readback_verified(record: dict[str, Any]) -> bool:
        event = record.get("event") if isinstance(record.get("event"), dict) else {}
        payload = record.get("payload") if isinstance(record.get("payload"), dict) else {}
        decision = record.get("decision") if isinstance(record.get("decision"), dict) else {}
        if payload.get("readbackVerified") is True:
            return True
        if event.get("eventType") == "casper_decision_readback_verified":
            return True
        readback = decision.get("readback") if isinstance(decision.get("readback"), dict) else {}
        if readback.get("verified") is True and readback.get("receiptVerified") is True:
            return True
        return readback.get("status") == "verified" and readback.get("receiptVerified") is True

    @staticmethod
    def _has_blocker(decision: dict[str, Any], blocker: str) -> bool:
        evidence = decision.get("evidenceBundle") if isinstance(decision.get("evidenceBundle"), dict) else {}
        return blocker in {str(item) for item in evidence.get("hardBlockers") or []}

    @staticmethod
    def _rate(count: int, total: int) -> float | None:
        if total <= 0:
            return None
        return round(count / total, 4)
