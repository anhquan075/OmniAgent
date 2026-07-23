from app.core.settings import get_settings
from app.services.casper.contract import CasperDecisionContractService
from app.services.casper.guardrails import CasperGuardrailService
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.proof_bundle import CasperProofBundleService
from app.services.casper.rwa_evidence import CasperRwaEvidenceService


def test_casper_proof_bundle_includes_lifecycle_score_and_recovery(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    get_settings.cache_clear()


def test_agent_rationale_present_accepts_rationale_hash() -> None:
    score = CasperProofBundleService.proof_score(
        preflight={"rpcReachable": True},
        decision={
            "proofDigest": "sha256:proof",
            "rationaleHash": "sha256:d561b44b5a6aed1b8274031bf206834394bf5a859df2b2a8f2e359cc7bb22a99",
            "policyGate": "approved",
            "guardrailHash": "sha256:guardrail",
            "decisionReceipt": {"receiptValue": "receipt"},
            "evidenceBundle": {
                "sourceHash": "sha256:source",
                "evidenceGraph": {"graphDigest": "sha256:graph"},
            },
            "x402": {"status": "verified"},
        },
        deploy_status={"status": "confirmed"},
        readback={"verified": True},
        blockers=[],
    )

    assert score["checks"]["agentRationalePresent"] is True

    missing = CasperProofBundleService.proof_score(
        preflight={"rpcReachable": True},
        decision={"proofDigest": "sha256:proof"},
        deploy_status={"status": "confirmed"},
        readback={"verified": True},
        blockers=[],
    )
    assert missing["checks"]["agentRationalePresent"] is False


def test_proof_score_accepts_readback_receipt_and_top_level_source_hash() -> None:
    score = CasperProofBundleService.proof_score(
        preflight={"rpcReachable": True},
        decision={
            "proofDigest": "sha256:proof",
            "rationaleHash": "sha256:rationale",
            "sourceHash": "sha256:source",
            "policyGate": "approved",
            "guardrailHash": "sha256:guardrail",
            "readback": {
                "decisionReceipt": "id|approve|22|sha256:proof|sha256:rationale|sha256:source|ts|approved||sha256:g",
                "receiptVerified": True,
            },
        },
        deploy_status={"status": "confirmed"},
        readback={"verified": True},
        blockers=[],
    )

    assert score["checks"]["decisionReceiptPresent"] is True
    assert score["checks"]["evidenceSourceHashPresent"] is True
    assert score["checks"]["evidenceGraphDigestPresent"] is True
    assert score["checks"]["x402PaidEvidenceVerified"] is False


def test_enrich_decision_overlays_verified_live_x402(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_X402_EVIDENCE_URL", "https://example.com/api/x402/rwa-evidence")
    monkeypatch.setenv(
        "CASPER_X402_RECEIPT",
        (
            '{"receiptId":"93074ccb7f55f7a6eac5f4acdf5de21943c43384a1bfb0f1e194c736eed3bae5",'
            '"provider":"x402","resourceUrl":"https://example.com/api/x402/rwa-evidence",'
            '"paidAt":"2026-07-23T00:00:00+00:00","amount":"1000000","currency":"WCSPR",'
            '"network":"casper:casper-test",'
            '"settlementTxHash":"93074ccb7f55f7a6eac5f4acdf5de21943c43384a1bfb0f1e194c736eed3bae5",'
            '"seller":"005fbafb3d180056637745218c3a21bef20ad4aca0737b676125791db7a2ead0c6",'
            '"buyer":"009201bf2e2468c8ae48c516dd0dadb4174a523bd1869b6d422795712a7b9d65cc"}'
        ),
    )
    get_settings.cache_clear()

    enriched = CasperProofBundleService.enrich_decision_for_proof(
        {
            "decisionId": "proof-x402",
            "sourceHash": "sha256:source",
            "x402": {"status": "unavailable", "endpoint": None, "receipt": None, "hardBlockers": []},
        }
    )

    assert enriched is not None
    assert enriched["x402"]["status"] == "verified"
    assert enriched["x402"]["receipt"]["bindingStatus"] == "bound"
    score = CasperProofBundleService.proof_score(
        preflight={"rpcReachable": True},
        decision=enriched,
        deploy_status={"status": "confirmed"},
        readback={"verified": True},
        blockers=[],
    )
    assert score["checks"]["x402PaidEvidenceVerified"] is True
    get_settings.cache_clear()


def test_casper_proof_bundle_surfaces_receipt_and_agentic_lifecycle(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    get_settings.cache_clear()
    evidence = CasperRwaEvidenceService.build_evidence_bundle(
        {
            "evidence": [
                {
                    "id": "treasury-yield-10y",
                    "label": "US 10Y Treasury yield",
                    "url": "https://home.treasury.gov/resource-center/data-chart-center/interest-rates",
                    "observedAt": "2026-07-02T12:00:00+00:00",
                    "observedValue": 4.2,
                    "threshold": 4.5,
                    "unit": "percent",
                }
            ]
        }
    )
    guardrails = CasperGuardrailService.evaluate({
        "evidenceBundle": evidence,
        "proposedAction": "hold",
        "rationale": "Collateral evidence is under threshold.",
    })
    result = CasperDecisionContractService.record_decision(
        {
            "decisionId": "proof-008",
            "action": "hold",
            "riskScore": evidence["riskScore"],
            "rationale": "Collateral evidence is under threshold.",
            "evidenceBundle": evidence,
            "guardrails": guardrails,
        }
    )

    bundle = CasperProofBundleService.get_live_proof_bundle({"limit": 5})

    assert bundle["decisionReceipt"]["decisionId"] == "proof-008"
    assert bundle["decisionReceipt"]["proofDigest"] == result["decision"]["proofDigest"]
    assert [step["state"] for step in bundle["lifecycle"][:4]] == [
        "sense",
        "propose",
        "critique",
        "policy_gate",
    ]
    assert bundle["proofScore"]["checks"]["decisionReceiptPresent"] is True
    assert bundle["proofScore"]["checks"]["evidenceSourceHashPresent"] is True
    assert bundle["proofScore"]["checks"]["guardrailHashPresent"] is True

    get_settings.cache_clear()
    CasperDecisionContractService.record_decision(
        {
            "decisionId": "proof-001",
            "action": "hold",
            "riskScore": 51,
            "rationale": "Dry-run proof bundle fixture.",
            "sourceHash": "source-proof",
        }
    )

    bundle = CasperProofBundleService.get_live_proof_bundle({"limit": 5})

    assert bundle["network"] == "casper"
    assert bundle["status"] == "blocked"
    assert bundle["lifecycle"][0]["state"] == "sense"
    assert bundle["proofScore"]["hardBlocked"] is True
    assert bundle["proofScore"]["checks"]["decisionPayloadValid"] is True
    assert bundle["proofScore"]["checks"]["agentRationalePresent"] is True
    assert bundle["deployStatus"]["status"] == "not_submitted"
    assert bundle["readback"]["verified"] is False
    assert bundle["latestDecision"]["decisionId"] == "proof-001"

    get_settings.cache_clear()


def test_casper_proof_bundle_marks_readback_mismatch_as_hard_blocker(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    get_settings.cache_clear()
    result = CasperDecisionContractService.record_decision(
        {
            "decisionId": "proof-002",
            "action": "hold",
            "riskScore": 51,
            "rationale": "Dry-run proof bundle fixture.",
            "sourceHash": "source-proof",
        }
    )
    decision = dict(result["decision"])
    decision["readback"] = {"proofDigest": "sha256:not-the-same"}
    CasperDecisionLedger.append_event({
        "eventType": "casper_decision_readback_verified",
        "payload": {"decision": decision},
    })

    bundle = CasperProofBundleService.get_live_proof_bundle({"limit": 5})

    assert "casper_readback_digest_mismatch" in bundle["proofScore"]["hardBlockers"]
    assert bundle["readback"]["verified"] is False

    get_settings.cache_clear()


def test_casper_proof_bundle_refresh_status_overrides_stored_deploy_status(
    tmp_path,
    monkeypatch,
) -> None:
    client_path = tmp_path / "casper-client"
    deploy_hash = "c" * 64
    client_path.write_text("#!/bin/sh\nprintf 'execution_result: Success'\n", encoding="utf-8")
    client_path.chmod(0o755)
    monkeypatch.setenv("CASPER_CLIENT_PATH", str(client_path))
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    get_settings.cache_clear()
    result = CasperDecisionContractService.record_decision(
        {
            "decisionId": "proof-007",
            "action": "hold",
            "riskScore": 51,
            "rationale": "Dry-run proof bundle fixture.",
            "sourceHash": "source-proof",
        }
    )
    decision = {
        **result["decision"],
        "deployHash": deploy_hash,
        "transactionHash": deploy_hash,
        "deployStatus": {
            "status": "pending_or_unverified",
            "hardBlockers": ["casper_deploy_not_confirmed"],
        },
    }
    CasperDecisionLedger.append_event({
        "eventType": "casper_decision_readback_blocked",
        "payload": {"decision": decision},
    })

    bundle = CasperProofBundleService.get_live_proof_bundle({"limit": 5, "refreshStatus": True})

    assert bundle["deployStatus"]["status"] == "confirmed"
    assert bundle["deployStatus"]["hardBlockers"] == []

    get_settings.cache_clear()


def test_latest_casper_event_skips_cycle_failures_without_decisions() -> None:
    decision_event = {
        "eventType": "casper_decision_dry_run",
        "payload": {"decision": {"decisionId": "latest-decision"}},
    }
    failure_event = {
        "eventType": "casper_agent_cycle_failed",
        "payload": {"hardBlockers": ["casper_agent_cycle_failed"]},
    }

    assert CasperProofBundleService.latest_casper_event([
        failure_event,
        decision_event,
    ]) == decision_event


def test_proof_bundle_retains_verified_receipt_after_duplicate_blocked_loops(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    monkeypatch.setenv("CASPER_LEDGER_MAX_EVENTS", "20")
    get_settings.cache_clear()
    CasperDecisionLedger.clear_current_log()
    proof_digest = "sha256:" + "a" * 64
    deploy_hash = "d" * 64
    verified_decision = {
        "decisionId": "same-semantic-decision",
        "action": "hold",
        "riskScore": 41,
        "rationale": "Verified collateral decision.",
        "proofDigest": proof_digest,
        "policyGate": "approved",
        "deployHash": deploy_hash,
        "deployStatus": {"status": "confirmed", "hardBlockers": []},
        "readback": {
            "proofDigest": proof_digest,
            "source": "casper_json_rpc_query_global_state",
            "stateRootHash": "state-root",
            "receiptVerified": True,
        },
    }
    CasperDecisionLedger.append_event({
        "eventType": "casper_decision_readback_verified",
        "payload": {"decision": verified_decision, "readbackVerified": True},
    })
    for index in range(10):
        CasperDecisionLedger.append_event({
            "eventType": "casper_decision_live_submit_blocked",
            "payload": {
                "decision": {
                    "decisionId": "same-semantic-decision",
                    "action": "hold",
                    "riskScore": 41,
                    "rationale": f"Duplicate loop {index}.",
                    "proofDigest": f"sha256:blocked-{index}",
                    "policyGate": "approved",
                },
                "hardBlockers": ["casper_chain_duplicate_intent"],
                "submitted": False,
            },
        })

    bundle = CasperProofBundleService.get_live_proof_bundle({"limit": 5})

    assert bundle["latestDecision"]["decisionId"] == "same-semantic-decision"
    assert bundle["latestDecision"]["deployHash"] == deploy_hash
    assert bundle["deployStatus"]["status"] == "confirmed"
    assert bundle["readback"]["verified"] is True

    get_settings.cache_clear()


def test_latest_casper_event_advances_to_newer_submitted_deploy() -> None:
    older_verified = {
        "eventType": "casper_decision_readback_verified",
        "payload": {
            "decision": {
                "decisionId": "older-verified",
                "deployHash": "a" * 64,
                "readback": {"proofDigest": "sha256:older"},
            },
        },
    }
    newer_submitted = {
        "eventType": "casper_decision_submitted",
        "payload": {
            "decision": {
                "decisionId": "newer-submitted",
                "deployHash": "b" * 64,
            },
        },
    }

    assert CasperProofBundleService.latest_casper_event([
        newer_submitted,
        older_verified,
    ]) == newer_submitted


def test_latest_casper_event_keeps_newer_nonduplicate_decision() -> None:
    newer_dry_run = {
        "eventType": "casper_decision_dry_run",
        "payload": {
            "decision": {
                "decisionId": "newer-dry-run",
                "proofDigest": "sha256:newer",
            },
        },
    }
    older_verified = {
        "eventType": "casper_decision_readback_verified",
        "payload": {
            "decision": {
                "decisionId": "older-verified",
                "deployHash": "a" * 64,
                "readback": {"proofDigest": "sha256:older"},
            },
        },
    }

    assert CasperProofBundleService.latest_casper_event([
        newer_dry_run,
        older_verified,
    ]) == newer_dry_run


def test_proof_bundle_ledger_version_advances_after_event_count_reaches_cap(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    monkeypatch.setenv("CASPER_LEDGER_MAX_EVENTS", "3")
    get_settings.cache_clear()
    CasperDecisionLedger.clear_current_log()
    for index in range(4):
        CasperDecisionLedger.append_event({
            "eventType": "casper_decision_dry_run",
            "payload": {
                "decision": {
                    "decisionId": f"cycle-{index}",
                    "proofDigest": f"sha256:{index}",
                },
            },
        })

    bundle = CasperProofBundleService.get_live_proof_bundle({"limit": 2})

    assert bundle["ledger"]["eventCount"] == 3
    assert bundle["ledger"]["latestEventId"] == 4

    get_settings.cache_clear()
