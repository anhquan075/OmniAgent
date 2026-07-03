from app.core.settings import get_settings
from app.services.casper.client import CasperJsonRpcClient
from app.services.casper.submitter import CasperCliSubmitter


class FakeResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, object]:
        return self.payload


def test_sync_call_posts_to_configured_rpc_url(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    class FakeClient:
        def __init__(self, timeout: float) -> None:
            self.timeout = timeout

        def __enter__(self) -> "FakeClient":
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def post(self, url: str, json: dict[str, object]) -> FakeResponse:
            calls.append({"url": url, "json": json, "timeout": self.timeout})
            return FakeResponse({"result": {"ok": True}})

    monkeypatch.setenv("CASPER_RPC_URL", "https://rpc.example")
    monkeypatch.setenv("CASPER_RPC_TIMEOUT_SEC", "3")
    monkeypatch.setattr("app.services.casper.client.httpx.Client", FakeClient)
    get_settings.cache_clear()

    result = CasperJsonRpcClient.sync_call("chain_get_state_root_hash")

    assert result == {"result": {"ok": True}}
    assert calls == [{
        "url": "https://rpc.example",
        "json": {
            "id": 1,
            "jsonrpc": "2.0",
            "method": "chain_get_state_root_hash",
            "params": [],
        },
        "timeout": 3.0,
    }]


def test_get_state_root_hash_sync_extracts_state_root(monkeypatch) -> None:
    monkeypatch.setattr(
        CasperJsonRpcClient,
        "sync_call",
        staticmethod(lambda *_: {"result": {"state_root_hash": "a" * 64}}),
    )

    assert CasperJsonRpcClient.get_state_root_hash_sync() == "a" * 64


def test_query_global_state_sync_uses_path_array(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_call(method: str, params: dict[str, object]) -> dict[str, object]:
        captured.update({"method": method, "params": params})
        return {"result": {"stored_value": {"CLValue": {"parsed": "sha256:abc"}}}}

    monkeypatch.setattr(CasperJsonRpcClient, "sync_call", staticmethod(fake_call))

    result = CasperJsonRpcClient.query_global_state_sync("b" * 64, "hash-contract", "latest")

    assert result == {"stored_value": {"CLValue": {"parsed": "sha256:abc"}}}
    assert captured["method"] == "query_global_state"
    assert captured["params"] == {
        "state_root_hash": "b" * 64,
        "key": "hash-contract",
        "path": ["latest"],
    }


def test_submitter_falls_back_to_rpc_for_latest_digest(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "c" * 64)
    get_settings.cache_clear()
    monkeypatch.setattr(CasperCliSubmitter, "is_client_available", staticmethod(lambda: False))
    monkeypatch.setattr(
        CasperJsonRpcClient,
        "get_state_root_hash_sync",
        staticmethod(lambda: "d" * 64),
    )
    monkeypatch.setattr(
        CasperJsonRpcClient,
        "query_global_state_sync",
        staticmethod(lambda *_: {"stored_value": {"CLValue": {"parsed": "sha256:abc"}}}),
    )

    result = CasperCliSubmitter.query_latest_proof_digest()

    assert result["status"] == "ready"
    assert result["source"] == "casper_json_rpc_query_global_state"
    assert result["stateRootHash"] == "d" * 64
    assert result["proofDigest"] == "sha256:abc"


def test_submitter_falls_back_to_rpc_for_decision_receipt(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "e" * 64)
    get_settings.cache_clear()
    monkeypatch.setattr(CasperCliSubmitter, "is_client_available", staticmethod(lambda: False))
    monkeypatch.setattr(
        CasperJsonRpcClient,
        "get_state_root_hash_sync",
        staticmethod(lambda: "f" * 64),
    )
    monkeypatch.setattr(
        CasperJsonRpcClient,
        "get_dictionary_item_sync",
        staticmethod(lambda *_: {"stored_value": {"CLValue": {"parsed": "receipt-value"}}}),
    )

    result = CasperCliSubmitter.query_decision_receipt("decision-1")

    assert result["status"] == "ready"
    assert result["source"] == "casper_json_rpc_dictionary_item"
    assert result["stateRootHash"] == "f" * 64
    assert result["decisionReceipt"] == "receipt-value"


def test_submitter_uses_cli_when_client_is_available(monkeypatch) -> None:
    monkeypatch.setattr(CasperCliSubmitter, "is_client_available", staticmethod(lambda: True))

    def fake_run(command: list[str], _: str) -> dict[str, object]:
        return {
            "status": "ready",
            "hardBlockers": [],
            "cliCommand": command,
            "cliOutput": '{"result":{"state_root_hash":"' + "1" * 64 + '"}}',
        }

    monkeypatch.setattr(CasperCliSubmitter, "run_command", staticmethod(fake_run))

    result = CasperCliSubmitter.get_state_root_hash()

    assert result["status"] == "ready"
    assert result["stateRootHash"] == "1" * 64
    assert "source" not in result
    assert result["cliCommand"][1] == "get-state-root-hash"
