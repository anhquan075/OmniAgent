from pathlib import Path
from types import SimpleNamespace
import asyncio
import importlib.util
import sys


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
READINESS_SCRIPT = SCRIPTS_DIR / "check-casper-testnet-readiness.py"
CYCLE_SCRIPT = SCRIPTS_DIR / "run-casper-decision-cycle.py"
API_SCRIPT = SCRIPTS_DIR / "omniagent_api.py"


def load_script(path: Path, name: str):
    if str(SCRIPTS_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPTS_DIR))
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[str(spec.name)] = module
    spec.loader.exec_module(module)
    return module


def test_casper_readiness_reports_missing_live_config() -> None:
    module = load_script(READINESS_SCRIPT, "check_casper_testnet_readiness")
    results = module.summarize_preflight(
        {
            "hardBlockers": [
                "casper_account_missing",
                "casper_secret_key_path_missing",
                "casper_decision_contract_hash_missing",
            ],
            "warnings": [],
        }
    )

    assert {item.name for item in results} >= {
        "casper_account_missing",
        "casper_secret_key_path_missing",
        "casper_decision_contract_hash_missing",
    }
    assert all(item.severity == "error" for item in results)


def test_casper_readiness_run_returns_nonzero_for_blockers(monkeypatch) -> None:
    module = load_script(READINESS_SCRIPT, "check_casper_testnet_readiness_run")

    class FakeClient:
        def __init__(self, api_url: str, operator_token: str | None = None) -> None:
            self.api_url = api_url
            self.operator_token = operator_token

        async def health(self) -> dict[str, object]:
            return {"status": "ok"}

        async def tool(self, name: str, args: dict[str, object], timeout: int = 90) -> dict[str, object]:
            return {"hardBlockers": ["casper_account_missing"], "warnings": []}

    monkeypatch.setattr(module, "ApiClient", FakeClient)

    code = asyncio.run(module.run(SimpleNamespace(api_url="http://127.0.0.1:8000")))

    assert code == 1


def test_casper_decision_cycle_real_submit_requires_flag() -> None:
    module = load_script(CYCLE_SCRIPT, "run_casper_decision_cycle")

    try:
        asyncio.run(module.run(SimpleNamespace(
            api_url="http://127.0.0.1:8000",
            dry_run=False,
            decision_id="demo",
            action="",
            rationale="",
            i_understand_this_submits_casper_testnet=False,
        )))
    except RuntimeError as error:
        assert "--i-understand-this-submits-casper-testnet" in str(error)
    else:
        raise AssertionError("real submit must require explicit flag")


def test_casper_decision_cycle_dry_run_uses_mcp_without_live_submit(monkeypatch) -> None:
    module = load_script(CYCLE_SCRIPT, "run_casper_decision_cycle_dry_run")
    calls: list[tuple[str, dict[str, object]]] = []
    clients: list[object] = []

    class FakeClient:
        def __init__(self, api_url: str, operator_token: str | None = None) -> None:
            self.api_url = api_url
            self.operator_token = operator_token
            clients.append(self)

        async def health(self) -> dict[str, object]:
            return {"status": "ok"}

        async def tool(self, name: str, args: dict[str, object], timeout: int = 90) -> dict[str, object]:
            calls.append((name, args))
            if name == "casper_live_preflight":
                return {"hardBlockers": ["casper_account_missing"], "liveSubmitEnabled": False}
            if name == "casper_run_autonomous_cycle":
                return {"status": "dry_run_blocked", "submitted": False, "cycle": {"evidence": {"scenario": "rwa-collateral-nav-risk-receipt"}}}
            raise AssertionError(f"unexpected tool call: {name}")

    monkeypatch.setattr(module, "ApiClient", FakeClient)

    code = asyncio.run(module.run(SimpleNamespace(
        api_url="http://127.0.0.1:8000",
        operator_token="operator-secret",
        dry_run=True,
        decision_id="demo",
        action="",
        rationale="",
        i_understand_this_submits_casper_testnet=False,
    )))

    assert code == 0
    assert [name for name, _ in calls] == ["casper_live_preflight", "casper_run_autonomous_cycle"]
    assert calls[-1][1]["submit"] is False
    assert clients[-1].operator_token == "operator-secret"


def test_api_client_sends_operator_token_for_tool_session(monkeypatch) -> None:
    module = load_script(API_SCRIPT, "omniagent_api_operator")
    calls: list[tuple[str, str, dict[str, str] | None]] = []

    class FakeResponse:
        def __init__(self, payload: dict[str, object]) -> None:
            self.payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return self.payload

    class FakeAsyncClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            return None

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def get(self, path: str, headers: dict[str, str] | None = None) -> FakeResponse:
            calls.append(("get", path, headers))
            return FakeResponse({"csrfToken": "csrf"})

        async def post(
            self,
            path: str,
            json: dict[str, object],
            headers: dict[str, str] | None = None,
        ) -> FakeResponse:
            calls.append(("post", path, headers))
            return FakeResponse({
                "result": {
                    "content": [
                        {"type": "text", "text": '{"network":"casper","status":"blocked"}'}
                    ]
                }
            })

    monkeypatch.setattr(module.httpx, "AsyncClient", FakeAsyncClient)

    result = asyncio.run(
        module.ApiClient("http://127.0.0.1:8000", operator_token="operator-secret").tool(
            "casper_record_decision",
            {},
        )
    )

    assert result["network"] == "casper"
    assert calls[0] == ("get", "/api/session", {"X-Operator-Token": "operator-secret"})
    assert calls[1][2] == {"X-CSRF-Token": "csrf"}
