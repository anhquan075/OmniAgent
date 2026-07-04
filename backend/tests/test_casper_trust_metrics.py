from app.services.casper.trust import CasperTrustService


def _event(decision_id: str, verified: bool, policy_gate: str = "approved") -> dict[str, object]:
    return {
        "eventType": "casper_decision_submitted",
        "payload": {
            "decision": {
                "decisionId": decision_id,
                "policyGate": policy_gate,
                "evidenceBundle": {"hardBlockers": []},
                "x402": {"status": "verified" if verified else "unavailable"},
                "readback": {
                    "verified": verified,
                    "receiptVerified": verified,
                },
            }
        },
    }


def test_trust_summary_reports_insufficient_data_for_empty_history() -> None:
    summary = CasperTrustService.get_trust_summary([])

    assert summary["status"] == "insufficient_data"
    assert summary["sampleSize"] == 0
    assert summary["verifiedReadbackRate"] is None


def test_trust_summary_is_derived_from_receipt_history() -> None:
    summary = CasperTrustService.get_trust_summary([
        _event("a", True),
        _event("b", False, "blocked"),
        _event("c", True),
    ])

    assert summary["status"] == "measured"
    assert summary["sampleSize"] == 3
    assert summary["verifiedReadbackRate"] == 0.6667
    assert summary["policyBlockedRate"] == 0.3333
    assert summary["paidEvidenceVerifiedRate"] == 0.6667


def test_trust_summary_counts_production_readback_events() -> None:
    summary = CasperTrustService.get_trust_summary([
        {
            "eventType": "casper_decision_readback_verified",
            "payload": {
                "readbackVerified": True,
                "decision": {
                    "decisionId": "a",
                    "policyGate": "approved",
                    "evidenceBundle": {"hardBlockers": []},
                    "x402": {"status": "unavailable"},
                    "readback": {"receiptVerified": True},
                },
            },
        },
        _event("b", False, "blocked"),
        _event("c", False),
    ])

    assert summary["status"] == "measured"
    assert summary["verifiedReadbackRate"] == 0.3333
