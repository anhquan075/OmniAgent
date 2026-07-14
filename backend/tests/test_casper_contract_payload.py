from app.services.casper.contract import CasperDecisionContractService
from app.services.casper.cli_command import CasperCliCommand
from app.services.casper.cli_output import CasperCliOutput
from app.services.casper.client import CasperJsonRpcClient
from app.services.casper.preflight import CasperPreflightService
from app.services.casper.submitter import CasperCliSubmitter
from app.services.casper.submission_guard import CasperSubmissionGuard
from app.core.settings import get_settings


def test_casper_decision_payload_has_stable_digest() -> None:
    payload = CasperDecisionContractService.build_decision_payload(
        {
            "decisionId": "risk-001",
            "action": "hold",
            "riskScore": 72,
            "rationale": "RWA feed confidence below threshold.",
            "sourceHash": "source-abc",
            "confidence": 0.66,
            "threshold": 0.7,
        }
    )
    duplicate = CasperDecisionContractService.build_decision_payload(dict(payload))

    assert payload["network"] == "casper-testnet"
    assert payload["decisionId"] == "risk-001"
    assert payload["action"] == "hold"
    assert payload["riskScore"] == 72
    assert payload["materialityGate"]["passed"] is False
    assert payload["proofDigest"].startswith("sha256:")
    assert duplicate["proofDigest"] == payload["proofDigest"]


def test_casper_cli_output_parses_current_transaction_and_readback_shapes() -> None:
    transaction_hash = "f" * 64
    state_root_hash = "e" * 64
    proof_digest = "sha256:" + "1" * 64

    assert CasperCliOutput.extract_hash(
        f'{{"result":{{"transaction_hash":{{"Version1":"{transaction_hash}"}}}}}}'
    ) == transaction_hash
    assert CasperCliOutput.extract_state_root_hash(
        f'{{"result":{{"state_root_hash":"{state_root_hash}"}}}}'
    ) == state_root_hash
    assert CasperCliOutput.extract_cl_value(
        f'{{"result":{{"stored_value":{{"CLValue":{{"parsed":"{proof_digest}"}}}}}}}}'
    ) == proof_digest
    assert CasperCliOutput.extract_execution_status(
        '{"result":{"execution_info":{"execution_result":{"Version2":{"error_message":null}}}}}'
    ) == "confirmed"
    assert CasperCliOutput.extract_balance_motes('{"result":{"balance":"2500000000"}}') == 2_500_000_000
    assert CasperCliCommand.query_key("a" * 64) == f"hash-{'a' * 64}"
    assert CasperCliCommand.query_key(f"hash-{'b' * 64}") == f"hash-{'b' * 64}"


def test_casper_dry_run_record_fails_closed_without_live_config() -> None:
    result = CasperDecisionContractService.record_decision(
        {
            "decisionId": "risk-002",
            "action": "rebalance_blocked",
            "riskScore": 88,
            "rationale": "Policy guard blocked drawdown exposure.",
            "sourceHash": "source-def",
            "submit": False,
        }
    )

    assert result["status"] == "dry_run_blocked"
    assert result["submitted"] is False
    assert result["requiresLiveFlag"] is True
    assert "casper_account_missing" in result["hardBlockers"]
    assert result["decision"]["proofDigest"].startswith("sha256:")
    assert result["explorerUrl"] is None


def test_live_payload_size_guard_rejects_unbounded_contract_arguments() -> None:
    decision = CasperDecisionContractService.build_decision_payload({
        "decisionId": "d" * 600,
        "action": "approve",
        "riskScore": 20,
        "sourceHash": "sha256:" + "a" * 64,
    })

    assert CasperDecisionContractService.live_payload_blockers(decision) == [
        "casper_decision_payload_too_large",
    ]


def test_live_submit_replaces_process_local_id_with_semantic_id() -> None:
    result = CasperDecisionContractService.record_decision({
        "decisionId": "rwa-collateral-0000",
        "action": "approve",
        "riskScore": 22,
        "sourceHash": "sha256:" + "a" * 64,
        "policyGate": "approved",
        "submit": True,
        "iUnderstandThisSubmitsCasperTestnet": True,
    })

    assert result["requestedDecisionId"] == "rwa-collateral-0000"
    assert result["decision"]["decisionId"].startswith("rwa-collateral-")
    assert result["decision"]["decisionId"] != "rwa-collateral-0000"


def test_submission_boundary_invokes_cli_once_for_semantic_duplicate(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "guard.sqlite3"))
    monkeypatch.setenv("CASPER_LIVE_REQUIRE_CHAIN_DEDUPE", "false")
    monkeypatch.setenv("CASPER_LIVE_MIN_SUBMIT_INTERVAL_SEC", "0")
    monkeypatch.setenv("CASPER_LIVE_MAX_SUBMISSIONS_PER_UTC_DAY", "50")
    monkeypatch.setenv("CASPER_LIVE_DAILY_BUDGET_MOTES", "125000000000")
    get_settings.cache_clear()
    monkeypatch.setattr(
        CasperPreflightService,
        "get_live_preflight",
        staticmethod(lambda _: {"hardBlockers": [], "status": "ready"}),
    )
    calls: list[str] = []

    def fake_submit(decision):
        calls.append(str(decision["decisionId"]))
        return {
            "submitted": True,
            "status": "submitted",
            "deployHash": "f" * 64,
            "transactionHash": "f" * 64,
            "hardBlockers": [],
            "cliCommand": ["casper-client", "put-deploy"],
            "paymentAmountMotes": 2_500_000_000,
            "outcomeUnknown": False,
        }

    monkeypatch.setattr(CasperCliSubmitter, "submit_decision", staticmethod(fake_submit))
    base = {
        "action": "approve",
        "riskScore": 22,
        "sourceHash": "sha256:" + "a" * 64,
        "submit": True,
        "iUnderstandThisSubmitsCasperTestnet": True,
        "policyGate": "approved",
    }

    first = CasperDecisionContractService.record_decision({**base, "decisionId": "first"})
    duplicate = CasperDecisionContractService.record_decision({**base, "decisionId": "second"})

    assert first["submitted"] is True
    assert duplicate["submitted"] is False
    assert duplicate["hardBlockers"] == ["casper_submission_duplicate_intent"]
    assert len(calls) == 1


def test_exact_chain_receipt_blocks_live_submit_before_cli(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "guard.sqlite3"))
    monkeypatch.setenv("CASPER_LIVE_REQUIRE_CHAIN_DEDUPE", "true")
    get_settings.cache_clear()
    monkeypatch.setattr(
        CasperPreflightService,
        "get_live_preflight",
        staticmethod(lambda _: {"hardBlockers": [], "status": "ready"}),
    )
    base = {
        "decisionId": "process-local-id",
        "action": "approve",
        "riskScore": 22,
        "sourceHash": "sha256:" + "a" * 64,
        "policyGate": "approved",
        "submit": True,
        "iUnderstandThisSubmitsCasperTestnet": True,
    }
    candidate = CasperDecisionContractService.build_decision_payload(base)
    semantic_id = CasperSubmissionGuard.semantic_decision_id(candidate)
    receipt = (
        f"{semantic_id}|approve|22|sha256:proof|sha256:rationale|"
        f"{base['sourceHash']}|2026-07-01T00:00:00+00:00|approved||sha256:guard"
    )
    monkeypatch.setattr(
        CasperJsonRpcClient,
        "probe_decision_receipt_sync",
        staticmethod(lambda decision_id: {
            "status": "found",
            "decisionId": decision_id,
            "decisionReceipt": receipt,
            "hardBlockers": [],
        }),
    )
    monkeypatch.setattr(
        CasperCliSubmitter,
        "query_latest_decision_id",
        staticmethod(lambda: (_ for _ in ()).throw(AssertionError("latest check should not run"))),
    )
    monkeypatch.setattr(
        CasperCliSubmitter,
        "submit_decision",
        staticmethod(lambda _: (_ for _ in ()).throw(AssertionError("CLI should not run"))),
    )

    result = CasperDecisionContractService.record_decision(base)

    assert result["submitted"] is False
    assert result["decision"]["decisionId"] == semantic_id
    assert result["hardBlockers"] == [CasperSubmissionGuard.CHAIN_DUPLICATE_BLOCKER]


def test_casper_live_submit_requires_client_for_stored_contract_call(tmp_path, monkeypatch) -> None:
    secret_path = tmp_path / "secret.pem"
    secret_path.write_text("not-a-real-secret", encoding="utf-8")
    monkeypatch.setenv("CASPER_ACCOUNT_PUBLIC_KEY", "01" + "a" * 64)
    monkeypatch.setenv("CASPER_SECRET_KEY_PATH", str(secret_path))
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "hash-decision")
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_PACKAGE_HASH", "hash-package")
    monkeypatch.setenv("CASPER_LIVE_SUBMIT_ENABLED", "true")
    monkeypatch.setenv("CASPER_CLIENT_PATH", str(tmp_path / "missing-casper-client"))
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    get_settings.cache_clear()

    result = CasperDecisionContractService.record_decision(
        {
            "decisionId": "risk-003",
            "action": "hold",
            "riskScore": 20,
            "rationale": "Configured submit path should not fake a deploy.",
            "sourceHash": "source-live",
            "submit": True,
            "iUnderstandThisSubmitsCasperTestnet": True,
        }
    )

    assert result["status"] == "blocked"
    assert result["submitted"] is False
    assert "casper_client_missing" in result["hardBlockers"]
    assert "casper_account_balance_unavailable" in result["hardBlockers"]
    assert result["ledgerEvent"]["eventType"] == "casper_decision_live_submit_blocked"

    get_settings.cache_clear()


def test_casper_live_submit_records_transaction_hash_without_leaking_paths(tmp_path, monkeypatch) -> None:
    secret_path = tmp_path / "secret.pem"
    client_path = tmp_path / "casper-client"
    ledger_path = tmp_path / "dashboard-log"
    transaction_hash = "a" * 64
    state_root_hash = "b" * 64
    secret_path.write_text("not-a-real-secret", encoding="utf-8")
    client_path.write_text(
        "#!/bin/sh\n"
        "case \"$1\" in\n"
        f"  get-state-root-hash) printf '{{\"result\":{{\"state_root_hash\":\"{state_root_hash}\"}}}}' ;;\n"
        "  query-balance) printf '{\"result\":{\"balance\":\"100000000000\"}}' ;;\n"
        f"  put-deploy) printf '{{\"transactionHash\":\"{transaction_hash}\"}}' ;;\n"
        "  *) exit 2 ;;\n"
        "esac\n",
        encoding="utf-8",
    )
    client_path.chmod(0o755)
    monkeypatch.setenv("CASPER_ACCOUNT_PUBLIC_KEY", "01" + "b" * 64)
    monkeypatch.setenv("CASPER_SECRET_KEY_PATH", str(secret_path))
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "hash-decision")
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_PACKAGE_HASH", "hash-package")
    monkeypatch.setenv("CASPER_LIVE_SUBMIT_ENABLED", "true")
    monkeypatch.setenv("CASPER_LIVE_REQUIRE_CHAIN_DEDUPE", "false")
    monkeypatch.setenv("CASPER_CLIENT_PATH", str(client_path))
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(ledger_path))
    get_settings.cache_clear()

    result = CasperDecisionContractService.record_decision(
        {
            "decisionId": "risk-004",
            "action": "hold",
            "riskScore": 20,
            "rationale": "Configured submit path should produce a receipt.",
            "sourceHash": "source-live",
            "submit": True,
            "iUnderstandThisSubmitsCasperTestnet": True,
        }
    )

    assert result["status"] == "submitted"
    assert result["submitted"] is True
    assert result["hardBlockers"] == []
    assert result["transactionHash"] == transaction_hash
    assert result["deployHash"] == transaction_hash
    assert result["ledgerEvent"]["eventType"] == "casper_decision_submitted"
    assert result["decision"]["transactionHash"] == transaction_hash
    assert str(secret_path) not in " ".join(result["cliCommand"])
    assert "<CASPER_SECRET_KEY_PATH>" in result["cliCommand"]
    assert result["cliCommand"][1] == "put-deploy"
    assert "--session-hash" in result["cliCommand"]
    assert "record_decision" in result["cliCommand"]

    get_settings.cache_clear()


def test_casper_deploy_status_refreshes_with_cli_status(tmp_path, monkeypatch) -> None:
    client_path = tmp_path / "casper-client"
    transaction_hash = "c" * 64
    client_path.write_text("#!/bin/sh\nprintf 'execution_result: Success'\n", encoding="utf-8")
    client_path.chmod(0o755)
    monkeypatch.setenv("CASPER_CLIENT_PATH", str(client_path))
    get_settings.cache_clear()

    status = CasperDecisionContractService.get_deploy_status(
        {"transactionHash": transaction_hash, "refresh": True}
    )

    assert status["status"] == "confirmed"
    assert status["hardBlockers"] == []
    assert status["transactionHash"] == transaction_hash
    assert status["cliCommand"][1] == "get-deploy"

    get_settings.cache_clear()
