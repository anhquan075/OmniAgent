import json

from fastapi.testclient import TestClient

from app.core.settings import get_settings
from app.main import create_app


def csrf_headers(client: TestClient, operator_token: str | None = None) -> dict[str, str]:
    headers = {"X-Operator-Token": operator_token} if operator_token else {}
    response = client.get("/api/session", headers=headers)
    assert response.status_code == 200
    return {"X-CSRF-Token": response.json()["csrfToken"]}


def test_session_is_not_operator_when_no_operator_token_configured(monkeypatch) -> None:
    monkeypatch.delenv("API_OPERATOR_TOKEN", raising=False)
    get_settings.cache_clear()
    client = TestClient(create_app())

    response = client.get("/api/session")

    assert response.status_code == 200
    assert response.json()["operator"] is False


def test_operator_token_still_protects_direct_actions(monkeypatch) -> None:
    monkeypatch.setenv("API_OPERATOR_TOKEN", "operator-secret")
    get_settings.cache_clear()
    client = TestClient(create_app())
    headers = csrf_headers(client)

    response = client.post("/api/cycle/run", json={"submit": False}, headers=headers)

    assert response.status_code == 403


def test_direct_cycle_endpoint_runs_without_script(monkeypatch) -> None:
    monkeypatch.setenv("API_OPERATOR_TOKEN", "operator-secret")
    get_settings.cache_clear()
    client = TestClient(create_app())
    captured: dict[str, object] = {}

    def fake_cycle(args: dict[str, object]) -> dict[str, object]:
        captured.update(args)
        return {"network": "casper", "status": "dry_run_blocked", "submitted": False}

    monkeypatch.setattr(
        "app.api.routes.dashboard.CasperAgentRuntimeService.run_autonomous_cycle",
        fake_cycle,
    )

    response = client.post(
        "/api/cycle/run",
        json={"decisionId": "dashboard-test", "submit": False},
        headers=csrf_headers(client, "operator-secret"),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "dry_run_blocked"
    assert captured == {"decisionId": "dashboard-test", "submit": False}


def test_direct_readback_endpoint_runs_without_script(monkeypatch) -> None:
    monkeypatch.setenv("API_OPERATOR_TOKEN", "operator-secret")
    get_settings.cache_clear()
    client = TestClient(create_app())
    captured: dict[str, object] = {}

    def fake_readback(args: dict[str, object]) -> dict[str, object]:
        captured.update(args)
        return {"network": "casper", "status": "verified", "verified": True}

    monkeypatch.setattr(
        "app.api.routes.dashboard.CasperReadbackService.record_readback",
        fake_readback,
    )

    response = client.post(
        "/api/readback/record",
        json={"decisionId": "dashboard-test"},
        headers=csrf_headers(client, "operator-secret"),
    )

    assert response.status_code == 200
    assert response.json()["verified"] is True
    assert captured == {"decisionId": "dashboard-test"}


def test_loop_start_uses_backend_settings_defaults(monkeypatch) -> None:
    monkeypatch.setenv("API_OPERATOR_TOKEN", "operator-secret")
    monkeypatch.setenv("CASPER_AGENT_LOOP_INTERVAL_SEC", "3600")
    monkeypatch.setenv("CASPER_AGENT_LOOP_DRY_RUN", "true")
    get_settings.cache_clear()
    client = TestClient(create_app())

    headers = csrf_headers(client, "operator-secret")
    response = client.post("/api/loop/start", headers=headers)

    assert response.status_code == 200
    assert response.json()["intervalSec"] == 3600
    assert response.json()["dryRun"] is True
    client.post("/api/loop/stop", headers=headers)


def test_live_loop_start_requires_independent_arm_and_safe_interval(monkeypatch) -> None:
    monkeypatch.setenv("API_OPERATOR_TOKEN", "operator-secret")
    monkeypatch.setenv("CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED", "false")
    get_settings.cache_clear()
    client = TestClient(create_app())
    headers = csrf_headers(client, "operator-secret")

    response = client.post("/api/loop/start?interval_sec=300&dry_run=false", headers=headers)

    assert response.status_code == 409
    assert response.json()["detail"] == "casper_agent_loop_live_submit_disabled"


def test_live_loop_rejects_interval_below_spend_cooldown(monkeypatch) -> None:
    monkeypatch.setenv("API_OPERATOR_TOKEN", "operator-secret")
    monkeypatch.setenv("CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED", "true")
    monkeypatch.setenv("CASPER_LIVE_MIN_SUBMIT_INTERVAL_SEC", "21600")
    get_settings.cache_clear()
    client = TestClient(create_app())
    headers = csrf_headers(client, "operator-secret")

    response = client.post("/api/loop/start?interval_sec=300&dry_run=false", headers=headers)

    assert response.status_code == 409
    assert response.json()["detail"] == "casper_agent_loop_interval_too_short"


def test_loop_rejects_non_positive_interval_even_in_dry_run(monkeypatch) -> None:
    monkeypatch.setenv("API_OPERATOR_TOKEN", "operator-secret")
    get_settings.cache_clear()
    client = TestClient(create_app())
    headers = csrf_headers(client, "operator-secret")

    response = client.post("/api/loop/start?interval_sec=-1&dry_run=true", headers=headers)

    assert response.status_code == 409
    assert response.json()["detail"] == "casper_agent_loop_interval_invalid"


def test_dashboard_stream_emits_snapshot_events(monkeypatch) -> None:
    monkeypatch.delenv("API_OPERATOR_TOKEN", raising=False)
    get_settings.cache_clear()

    async def fake_snapshot(limit: int = 10) -> dict[str, object]:
        return {
            "network": "casper",
            "casperAgentRuntime": {"loopStatus": {"running": True}},
            "casperProofBundle": {"latestDecision": {"decisionId": f"stream-{limit}"}},
        }

    monkeypatch.setattr(
        "app.api.routes.dashboard._dashboard_snapshot_payload",
        fake_snapshot,
    )

    client = TestClient(create_app())
    client.get("/api/session")

    with client.stream("GET", "/api/dashboard/stream?limit=3&once=true") as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        lines = []
        for line in response.iter_lines():
            lines.append(line)
            if line == "":
                break

    assert lines[0] == "event: dashboard_snapshot"
    assert '"decisionId":"stream-3"' in lines[1]
    payload = json.loads(lines[1].removeprefix("data: "))
    assert payload["streamMeta"]["transport"] == "sse"
    assert payload["streamMeta"]["event"] == "dashboard_snapshot"
    assert payload["streamMeta"]["intervalSec"] == 1.0
    assert "mcp_activity_log" in payload["streamMeta"]["channels"]
    assert "ai_output" in payload["streamMeta"]["channels"]
