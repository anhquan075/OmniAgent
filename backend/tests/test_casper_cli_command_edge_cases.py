from app.services.casper.cli_command import CasperCliCommand


def test_put_deploy_includes_session_hash(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "abc123")
    monkeypatch.setenv("CASPER_SECRET_KEY_PATH", "/tmp/secret.pem")
    monkeypatch.setenv("CASPER_CLIENT_PATH", "casper-client")
    cmd = CasperCliCommand.build_submit_command({"decisionId": "d1", "action": "approve", "riskScore": 30})
    assert "--session-hash" in cmd
    assert "abc123" in cmd


def test_put_deploy_includes_session_package_hash_when_no_hash(monkeypatch) -> None:
    monkeypatch.delenv("CASPER_DECISION_CONTRACT_HASH", raising=False)
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_PACKAGE_HASH", "pkg456")
    monkeypatch.setenv("CASPER_SECRET_KEY_PATH", "/tmp/secret.pem")
    monkeypatch.setenv("CASPER_CLIENT_PATH", "casper-client")
    cmd = CasperCliCommand.build_submit_command({"decisionId": "d1"})
    assert "--session-package-hash" in cmd
    assert "pkg456" in cmd


def test_session_args_include_all_decision_fields(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "abc")
    monkeypatch.setenv("CASPER_SECRET_KEY_PATH", "/tmp/secret.pem")
    monkeypatch.setenv("CASPER_CLIENT_PATH", "casper-client")
    cmd = CasperCliCommand.build_submit_command({
        "decisionId": "d1", "action": "approve", "proofDigest": "sha256:x",
        "rationaleHash": "sha256:y", "sourceHash": "sha256:z", "timestamp": "now",
        "riskScore": 30, "policyGate": "approved", "agentAccountHash": "acc",
        "guardrailHash": "sha256:g",
    })
    args_str = " ".join(cmd)
    assert "decision_id" in args_str
    assert "proof_digest" in args_str
    assert "risk_score" in args_str
    assert "guardrail_hash" in args_str


def test_redacted_command_replaces_secret_key(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "abc")
    monkeypatch.setenv("CASPER_SECRET_KEY_PATH", "/tmp/my_secret.pem")
    monkeypatch.setenv("CASPER_CLIENT_PATH", "casper-client")
    cmd = CasperCliCommand.build_submit_command({"decisionId": "d1"})
    redacted = CasperCliCommand.redacted_command(cmd)
    assert "<CASPER_SECRET_KEY_PATH>" in redacted
    assert "/tmp/my_secret.pem" not in redacted


def test_redacted_command_replaces_wasm_path(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_TRANSACTION_COMMAND", "put-txn")
    monkeypatch.setenv("CASPER_TRANSACTION_WASM_PATH", "/tmp/contract.wasm")
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "abc")
    monkeypatch.setenv("CASPER_SECRET_KEY_PATH", "/tmp/secret.pem")
    monkeypatch.setenv("CASPER_CLIENT_PATH", "casper-client")
    cmd = CasperCliCommand.build_submit_command({"decisionId": "d1"})
    redacted = CasperCliCommand.redacted_command(cmd)
    assert "<CASPER_TRANSACTION_WASM_PATH>" in redacted


def test_node_address_falls_back_to_rpc_url(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_NODE_ADDRESS", "")
    monkeypatch.setenv("CASPER_RPC_URL", "https://rpc.example.com/rpc")
    assert CasperCliCommand.node_address() == "https://rpc.example.com/rpc"


def test_node_address_uses_explicit_value(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_NODE_ADDRESS", "http://peer:7777")
    monkeypatch.setenv("CASPER_RPC_URL", "https://rpc.example.com/rpc")
    assert CasperCliCommand.node_address() == "http://peer:7777"


def test_status_command_name_for_put_deploy(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_TRANSACTION_COMMAND", "put-deploy")
    assert CasperCliCommand.status_command_name() == "get-deploy"


def test_status_command_name_for_put_txn(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_TRANSACTION_COMMAND", "put-txn")
    assert CasperCliCommand.status_command_name() == "get-transaction"


def test_query_key_prepends_hash_prefix() -> None:
    assert CasperCliCommand.query_key("abc123") == "hash-abc123"
    assert CasperCliCommand.query_key("hash-abc123") == "hash-abc123"
    assert CasperCliCommand.query_key("uref-xyz") == "uref-xyz"