from app.services.casper.trust import CasperTrustService


def _submitted(decision_id: str, *, policy_gate: str = "approved", paid: bool = True) -> dict[str, object]:
    return {
        "eventType": "casper_decision_submitted",
        "payload": {
            "decision": {
                "decisionId": decision_id,
                "policyGate": policy_gate,
                "evidenceBundle": {"hardBlockers": []},
                "x402": {"status": "verified" if paid else "unavailable"},
            }
        },
    }


def _readback(decision_id: str, *, verified: bool = True) -> dict[str, object]:
    return {
        "eventType": "casper_decision_readback_verified" if verified else "casper_decision_readback_blocked",
        "payload": {
            "readbackVerified": verified,
            "decision": {
                "decisionId": decision_id,
                "policyGate": "approved",
                "evidenceBundle": {"hardBlockers": []},
                "x402": {"status": "verified"},
                "readback": {"receiptVerified": verified},
            },
        },
    }


def test_trust_summary_reports_insufficient_data_for_empty_history() -> None:
    summary = CasperTrustService.get_trust_summary([])

    assert summary["status"] == "insufficient_data"
    assert summary["sampleSize"] == 0
    assert summary["verifiedReadbackRate"] is None


def test_trust_summary_is_derived_from_receipt_history() -> None:
    summary = CasperTrustService.get_trust_summary(
        [
            _submitted("a"),
            _readback("a"),
            _submitted("b", policy_gate="blocked", paid=False),
            _submitted("c"),
            _readback("c"),
        ],
        max_decisions=10,
    )

    assert summary["status"] == "measured"
    assert summary["sampleSize"] == 3
    assert summary["verifiedReadbackRate"] == 0.6667
    assert summary["policyBlockedRate"] == 0.3333
    assert summary["paidEvidenceVerifiedRate"] == 0.6667


def test_trust_summary_counts_production_readback_events() -> None:
    summary = CasperTrustService.get_trust_summary(
        [
            _readback("a"),
            _submitted("b", policy_gate="blocked", paid=False),
            _submitted("c", paid=False),
        ],
        max_decisions=10,
    )

    assert summary["status"] == "measured"
    assert summary["verifiedReadbackRate"] == 0.3333


def test_trust_summary_dedupes_duplicate_intent_retries() -> None:
    floods = [
        {
            "eventType": "casper_decision_live_submit_blocked",
            "payload": {
                "hardBlockers": ["casper_chain_duplicate_intent"],
                "decision": {
                    "decisionId": "same",
                    "policyGate": "approved",
                    "evidenceBundle": {"hardBlockers": []},
                    "x402": {"status": "verified"},
                },
            },
        }
        for _ in range(20)
    ]
    summary = CasperTrustService.get_trust_summary(
        [*floods, _readback("same"), _submitted("blocked-1", policy_gate="blocked", paid=False)],
        max_decisions=10,
    )

    assert summary["sampleSize"] == 2
    assert summary["verifiedReadbackRate"] == 0.5
    assert summary["policyBlockedRate"] == 0.5


def test_trust_summary_seeds_blocked_canary_when_absent() -> None:
    summary = CasperTrustService.get_trust_summary(
        [_submitted("a"), _readback("a"), _submitted("b"), _readback("b")],
        max_decisions=10,
        seeds=[
            {
                "decisionId": "desk-reject-1",
                "policyGate": "blocked",
                "transactionHash": "c" * 64,
            }
        ],
    )

    assert summary["sampleSize"] == 3
    assert summary["policyBlockedRate"] == 0.3333
    assert summary["components"]["seededBlockedDecisions"] == 1
    assert "settings_blocked_canary" in summary["sampleSources"]


def test_trust_summary_does_not_double_count_seed_already_in_ledger() -> None:
    summary = CasperTrustService.get_trust_summary(
        [_submitted("desk-reject-1", policy_gate="blocked", paid=False)],
        max_decisions=10,
        seeds=[{"decisionId": "desk-reject-1", "policyGate": "blocked"}],
    )

    assert summary["sampleSize"] == 1
    assert summary["components"]["seededBlockedDecisions"] == 0
