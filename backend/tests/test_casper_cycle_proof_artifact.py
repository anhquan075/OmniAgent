from pathlib import Path
from types import SimpleNamespace
import asyncio
import importlib.util
import json
import sys


SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
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


def test_casper_decision_cycle_writes_public_proof_artifact(monkeypatch, tmp_path) -> None:
    module = load_script(CYCLE_SCRIPT, "run_casper_decision_cycle_write_proof")
    proof_path = tmp_path / "proof.json"

    class FakeClient:
        def __init__(self, api_url: str, operator_token: str | None = None) -> None:
            self.api_url = api_url
            self.operator_token = operator_token

        async def health(self) -> dict[str, object]:
            return {"status": "ok"}

        async def tool(self, name: str, args: dict[str, object], timeout: int = 90) -> dict[str, object]:
            if name == "casper_live_preflight":
                return {"hardBlockers": ["casper_account_missing"], "liveSubmitEnabled": False}
            if name == "casper_run_autonomous_cycle":
                return {
                    "status": "dry_run_blocked",
                    "submitted": False,
                    "cycle": {"evidence": {"scenario": "rwa-collateral-nav-risk-receipt"}},
                }
            raise AssertionError(f"unexpected tool call: {name}")

        async def get_json(self, path: str, timeout: float = 60) -> dict[str, object]:
            assert path == "/api/public/proof"
            return {
                "network": "casper",
                "scenario": "rwa-collateral-nav-risk-receipt",
                "status": "blocked",
                "decisionId": "demo",
            }

    monkeypatch.setattr(module, "ApiClient", FakeClient)

    code = asyncio.run(module.run(SimpleNamespace(
        api_url="http://127.0.0.1:8000",
        operator_token="operator-secret",
        dry_run=True,
        decision_id="demo",
        action="",
        rationale="",
        write_proof=str(proof_path),
        demo_url="https://demo.example",
        video_url="https://video.example",
        i_understand_this_submits_casper_testnet=False,
    )))

    assert code == 0
    proof = json.loads(proof_path.read_text(encoding="utf-8"))
    assert proof["decisionId"] == "demo"
    assert proof["demoUrl"] == "https://demo.example"
    assert proof["videoUrl"] == "https://video.example"


def test_api_client_fetches_public_json_without_session(monkeypatch) -> None:
    module = load_script(API_SCRIPT, "omniagent_api_public_json")
    calls: list[tuple[str, str]] = []

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"network": "casper"}

    class FakeAsyncClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            return None

        async def __aenter__(self) -> "FakeAsyncClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def get(self, path: str, headers: dict[str, str] | None = None) -> FakeResponse:
            calls.append(("get", path))
            return FakeResponse()

    monkeypatch.setattr(module.httpx, "AsyncClient", FakeAsyncClient)

    result = asyncio.run(module.ApiClient("http://127.0.0.1:8000").get_json("/api/public/proof"))

    assert result == {"network": "casper"}
    assert calls == [("get", "/api/public/proof")]
