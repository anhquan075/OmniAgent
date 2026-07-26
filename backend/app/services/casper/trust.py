from __future__ import annotations

from typing import Any


class CasperTrustService:
    """Aggregate public-safe trust metrics from verified receipt history.

    Samples are decision-shaped: many ledger rows for the same decisionId
    (submit retries, readback follow-ups) collapse into one sample, and
    readback verification is OR-joined across those rows.
    """

    @staticmethod
    def get_trust_summary(
        events: object,
        *,
        min_samples: int = 3,
        max_decisions: int = 10,
        seeds: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        records = CasperTrustService._records_by_decision(
            events if isinstance(events, list) else [],
            max_decisions=max(1, max_decisions),
        )
        sample_sources = ["ledger"] if records else []
        seeded_blocked = 0
        for seed in seeds or []:
            if not isinstance(seed, dict):
                continue
            decision_id = str(seed.get("decisionId") or "").strip()
            if not decision_id:
                continue
            if any(record["decision"].get("decisionId") == decision_id for record in records):
                continue
            records.insert(
                0,
                {
                    "event": {"eventType": "settings_blocked_canary"},
                    "payload": {"readbackVerified": False, "source": "settings_blocked_canary"},
                    "decision": {
                        "decisionId": decision_id,
                        "policyGate": seed.get("policyGate") or "blocked",
                        "evidenceBundle": seed.get("evidenceBundle")
                        if isinstance(seed.get("evidenceBundle"), dict)
                        else {"hardBlockers": []},
                        "x402": seed.get("x402") if isinstance(seed.get("x402"), dict) else {},
                        "readback": seed.get("readback")
                        if isinstance(seed.get("readback"), dict)
                        else {},
                        "transactionHash": seed.get("transactionHash"),
                    },
                    "readbackVerified": bool(seed.get("readbackVerified")),
                    "source": "settings_blocked_canary",
                },
            )
            seeded_blocked += 1
            if "settings_blocked_canary" not in sample_sources:
                sample_sources.append("settings_blocked_canary")
            if len(records) > max(1, max_decisions):
                records = records[: max(1, max_decisions)]

        total = len(records)
        verified = sum(
            1
            for record in records
            if CasperTrustService._readback_verified(record) or record.get("readbackVerified") is True
        )
        blocked = sum(1 for record in records if record["decision"].get("policyGate") == "blocked")
        stale = sum(
            1 for record in records if CasperTrustService._has_blocker(record["decision"], "rwa_evidence_stale")
        )
        paid_verified = sum(
            1 for record in records if (record["decision"].get("x402") or {}).get("status") == "verified"
        )
        sufficient = total >= min_samples
        return {
            "status": "measured" if sufficient else "insufficient_data",
            "sampleSize": total,
            "minSampleSize": min_samples,
            "verifiedReadbackRate": CasperTrustService._rate(verified, total),
            "policyBlockedRate": CasperTrustService._rate(blocked, total),
            "staleEvidenceRate": CasperTrustService._rate(stale, total),
            "paidEvidenceVerifiedRate": CasperTrustService._rate(paid_verified, total),
            "sampleSources": sample_sources,
            "components": {
                "verifiedReadbacks": verified,
                "policyBlockedDecisions": blocked,
                "staleEvidenceDecisions": stale,
                "paidEvidenceVerifiedDecisions": paid_verified,
                "seededBlockedDecisions": seeded_blocked,
            },
        }

    @staticmethod
    def _records_by_decision(events: list[object], *, max_decisions: int) -> list[dict[str, Any]]:
        """Collapse newest-first ledger rows into one record per decisionId."""
        buckets: dict[str, dict[str, Any]] = {}
        order: list[str] = []
        for index, event in enumerate(events):
            if not isinstance(event, dict):
                continue
            record = CasperTrustService._decision_record_from_event(event)
            if not record:
                continue
            decision = record["decision"]
            decision_id = str(decision.get("decisionId") or "").strip()
            proof_digest = str(decision.get("proofDigest") or "").strip()
            key = decision_id or proof_digest or f"event:{index}"
            event_type = str(event.get("eventType") or "")
            is_readback = event_type in {
                "casper_decision_readback_verified",
                "casper_decision_readback_blocked",
            }
            verified_here = CasperTrustService._readback_verified(record)
            if key not in buckets:
                buckets[key] = {
                    **record,
                    "readbackVerified": verified_here,
                    "source": "ledger",
                }
                order.append(key)
                continue
            existing = buckets[key]
            existing["readbackVerified"] = bool(existing.get("readbackVerified") or verified_here)
            # Prefer a non-readback row for gate/x402/evidence (canonical decision).
            if not is_readback:
                existing["event"] = record["event"]
                existing["payload"] = record["payload"]
                existing["decision"] = record["decision"]
            else:
                # Keep the richer decision when only a readback row carries readback fields.
                existing_decision = existing.get("decision") if isinstance(existing.get("decision"), dict) else {}
                merged = dict(existing_decision)
                merged.update({k: v for k, v in decision.items() if v is not None})
                existing["decision"] = merged

        selected_keys = order[: max(1, max_decisions)]
        return [buckets[key] for key in selected_keys]

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
        if record.get("readbackVerified") is True:
            return True
        event = record.get("event") if isinstance(record.get("event"), dict) else {}
        payload = record.get("payload") if isinstance(record.get("payload"), dict) else {}
        decision = record.get("decision") if isinstance(record.get("decision"), dict) else {}
        if payload.get("readbackVerified") is True:
            return True
        if event.get("eventType") == "casper_decision_readback_verified":
            return True
        readback = decision.get("readback") if isinstance(decision.get("readback"), dict) else {}
        # Production readback rows set receiptVerified; verified/status are optional.
        if readback.get("verified") is True and readback.get("receiptVerified") is True:
            return True
        if readback.get("status") == "verified" and readback.get("receiptVerified") is True:
            return True
        if (
            event.get("eventType") == "casper_decision_readback_verified"
            and readback.get("receiptVerified") is True
        ):
            return True
        return False

    @staticmethod
    def _has_blocker(decision: dict[str, Any], blocker: str) -> bool:
        evidence = decision.get("evidenceBundle") if isinstance(decision.get("evidenceBundle"), dict) else {}
        return blocker in {str(item) for item in evidence.get("hardBlockers") or []}

    @staticmethod
    def _rate(count: int, total: int) -> float | None:
        if total <= 0:
            return None
        return round(count / total, 4)
