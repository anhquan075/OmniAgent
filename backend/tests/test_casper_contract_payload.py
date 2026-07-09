from app.services.casper.contract import CasperDecisionContractService
from app.services.casper.cli_command import CasperCliCommand
from app.services.casper.cli_output import CasperCliOutput
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
    assert result["hardBlockers"] == ["casper_client_missing"]
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
