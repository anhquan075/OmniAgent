from app.core.settings import get_settings
from app.services.casper.contract import CasperDecisionContractService
from app.services.casper.guardrails import CasperGuardrailService
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.proof_bundle import CasperProofBundleService
from app.services.casper.rwa_evidence import CasperRwaEvidenceService


def test_casper_proof_bundle_includes_lifecycle_score_and_recovery(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
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
