from app.core.settings import get_settings
from app.services.casper.contract import CasperDecisionContractService
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.proof_bundle import CasperProofBundleService
from app.services.casper.readback import CasperReadbackService


def test_casper_record_readback_verifies_latest_decision_digest(tmp_path, monkeypatch) -> None:
    secret_path = tmp_path / "secret.pem"
    client_path = tmp_path / "casper-client"
    deploy_hash = "d" * 64
    state_root_hash = "e" * 64
    secret_path.write_text("not-a-real-secret", encoding="utf-8")
    client_path.write_text(
        "#!/bin/sh\n"
        "case \"$1\" in\n"
        f"  get-state-root-hash) printf '{{\"result\":{{\"state_root_hash\":\"{state_root_hash}\"}}}}' ;;\n"
        "  query-balance) printf '{\"result\":{\"balance\":\"100000000000\"}}' ;;\n"
        f"  put-deploy) printf '{{\"result\":{{\"deploy_hash\":\"{deploy_hash}\"}}}}' ;;\n"
        "  get-deploy) printf 'execution_result: Success' ;;\n"
        "  query-global-state) printf '{}';;\n"
        "  *) exit 2 ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    client_path.chmod(0o755)
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    monkeypatch.setenv("CASPER_ACCOUNT_PUBLIC_KEY", "01" + "c" * 64)
    monkeypatch.setenv("CASPER_SECRET_KEY_PATH", str(secret_path))
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "hash-decision")
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_PACKAGE_HASH", "hash-package")
    monkeypatch.setenv("CASPER_LIVE_SUBMIT_ENABLED", "true")
    monkeypatch.setenv("CASPER_LIVE_REQUIRE_CHAIN_DEDUPE", "false")
    monkeypatch.setenv("CASPER_CLIENT_PATH", str(client_path))
    get_settings.cache_clear()
    result = CasperDecisionContractService.record_decision(
        {
            "decisionId": "proof-003",
            "action": "hold",
            "riskScore": 51,
            "rationale": "Dry-run proof bundle fixture.",
            "sourceHash": "source-proof",
            "submit": True,
            "iUnderstandThisSubmitsCasperTestnet": True,
        }
    )
    decision_id = result["decision"]["decisionId"]
    proof_digest = result["decision"]["proofDigest"]
    receipt_value = result["decision"]["decisionReceipt"]["receiptValue"]
    client_path.write_text(
        "#!/bin/sh\n"
        "case \"$1\" in\n"
        f"  get-state-root-hash) printf '{{\"result\":{{\"state_root_hash\":\"{state_root_hash}\"}}}}' ;;\n"
        "  get-deploy) printf 'execution_result: Success' ;;\n"
        "  get-dictionary-item) "
        f"printf '{{\"result\":{{\"stored_value\":{{\"CLValue\":{{\"parsed\":\"{receipt_value}\"}}}}}}}}'; "
        ";;\n"
        "  query-global-state) "
        f"printf '{{\"result\":{{\"stored_value\":{{\"CLValue\":{{\"parsed\":\"{proof_digest}\"}}}}}}}}'; "
        ";;\n"
        "  *) exit 2 ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    client_path.chmod(0o755)

    readback = CasperReadbackService.record_readback({"decisionId": decision_id})
    bundle = CasperProofBundleService.get_live_proof_bundle({"limit": 5})

    assert readback["verified"] is True
    assert readback["ledgerEvent"]["eventType"] == "casper_decision_readback_verified"
    assert readback["readback"]["source"] == "casper_client_query_global_state"
    assert readback["readback"]["stateRootHash"] == state_root_hash
    assert readback["readback"]["decisionReceipt"] == receipt_value
    assert readback["readback"]["receiptVerified"] is True
    assert bundle["readback"]["verified"] is True
    assert bundle["proofScore"]["checks"]["readbackMatchesDigest"] is True
    assert readback["submissionGuardTransition"]["status"] == "confirmed"

    get_settings.cache_clear()


def test_casper_record_readback_rejects_caller_supplied_digest(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    get_settings.cache_clear()
    result = CasperDecisionContractService.record_decision(
        {
            "decisionId": "proof-004",
            "action": "hold",
            "riskScore": 51,
            "rationale": "Dry-run proof bundle fixture.",
            "sourceHash": "source-proof",
        }
    )

    readback = CasperReadbackService.record_readback(
        {
            "decisionId": "proof-004",
            "observedProofDigest": result["decision"]["proofDigest"],
            "deployConfirmed": True,
        }
    )

    assert readback["verified"] is False
    assert readback["ledgerEvent"]["eventType"] == "casper_decision_readback_blocked"
    assert "casper_deploy_hash_missing" in readback["hardBlockers"]

    get_settings.cache_clear()


def test_casper_record_readback_selects_snake_case_deploy_hash(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "hash-decision")
    monkeypatch.setenv("CASPER_CLIENT_PATH", str(tmp_path / "missing-casper-client"))
    get_settings.cache_clear()
    first = CasperDecisionContractService.record_decision({
        "decisionId": "proof-005",
        "rationale": "First dry-run proof bundle fixture.",
    })
    second = CasperDecisionContractService.record_decision({
        "decisionId": "proof-006",
        "rationale": "Second dry-run proof bundle fixture.",
    })
    first_decision = {**first["decision"], "deployHash": "a" * 64, "transactionHash": "a" * 64}
    second_decision = {**second["decision"], "deployHash": "b" * 64, "transactionHash": "b" * 64}
    CasperDecisionLedger.append_event({
        "eventType": "casper_decision_submitted",
        "payload": {"decision": first_decision},
    })
    CasperDecisionLedger.append_event({
        "eventType": "casper_decision_submitted",
        "payload": {"decision": second_decision},
    })

    readback = CasperReadbackService.record_readback({"deploy_hash": "a" * 64})

    assert readback["decision"]["decisionId"] == "proof-005"
    assert "casper_client_missing" in readback["hardBlockers"]

    get_settings.cache_clear()


def test_readback_can_reconcile_unknown_outcome_with_operator_hash(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    get_settings.cache_clear()
    result = CasperDecisionContractService.record_decision({
        "decisionId": "unknown-outcome-1",
        "action": "hold",
        "sourceHash": "sha256:" + "a" * 64,
    })

    decision = CasperReadbackService.target_decision({
        "decisionId": "unknown-outcome-1",
        "deployHash": "f" * 64,
    })

    assert decision["decisionId"] == result["decision"]["decisionId"]
    assert decision.get("deployHash") is None

    get_settings.cache_clear()
