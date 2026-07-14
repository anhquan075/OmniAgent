import asyncio
import time
from types import SimpleNamespace

import pytest

from app.api.routes.dashboard import loop_start, loop_stop
from app.core.settings import get_settings
from app.main import casper_lifespan
from app.services.casper.loop import (
    LoopState,
    agent_loop,
    auto_readback,
    get_loop_status,
    loop_state,
    poll_deploy_status,
    stop_loop as stop_agent_loop,
)


def reset_loop_state() -> None:
    loop_state.__dict__.update(LoopState().__dict__)


@pytest.mark.asyncio
async def test_poll_deploy_status_returns_confirmed_after_retry(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_AGENT_LOOP_POLL_MAX_RETRIES", "3")
    monkeypatch.setenv("CASPER_AGENT_LOOP_POLL_INTERVAL_SEC", "0")
    get_settings.cache_clear()
    responses = iter([
        {"status": "pending_or_unverified"},
        {"status": "confirmed"},
    ])
    calls: list[str] = []

    def fake_status(deploy_hash: str) -> dict[str, object]:
        calls.append(deploy_hash)
        return next(responses)

    monkeypatch.setattr(
        "app.services.casper.loop.CasperCliSubmitter.get_transaction_status",
        fake_status,
    )

    assert await poll_deploy_status("d" * 64) == "confirmed"
    assert calls == ["d" * 64, "d" * 64]


@pytest.mark.asyncio
async def test_poll_deploy_status_returns_unconfirmed_after_max_retries(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_AGENT_LOOP_POLL_MAX_RETRIES", "2")
    monkeypatch.setenv("CASPER_AGENT_LOOP_POLL_INTERVAL_SEC", "0")
    get_settings.cache_clear()
    calls: list[str] = []

    def fake_status(deploy_hash: str) -> dict[str, object]:
        calls.append(deploy_hash)
        return {"status": "pending_or_unverified"}

    monkeypatch.setattr(
        "app.services.casper.loop.CasperCliSubmitter.get_transaction_status",
        fake_status,
    )

    assert await poll_deploy_status("e" * 64) == "unconfirmed"
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_auto_readback_calls_record_readback_with_decision_and_deploy(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_readback(args: dict[str, object]) -> dict[str, object]:
        captured.update(args)
        return {"verified": True}

    monkeypatch.setattr(
        "app.services.casper.loop.CasperReadbackService.record_readback",
        fake_readback,
    )

    cycle_context = {
        "cycleId": "cycle-1",
        "origin": "scheduled_loop",
        "startedAt": "2026-07-10T10:00:00+00:00",
    }
    result = await auto_readback("decision-1", "f" * 64, cycle_context)

    assert result == {"verified": True}
    assert captured == {
        "decisionId": "decision-1",
        "deployHash": "f" * 64,
        "cycleContext": cycle_context,
    }


@pytest.mark.asyncio
async def test_auto_readback_returns_none_on_exception(monkeypatch) -> None:
    def fake_readback(_: dict[str, object]) -> dict[str, object]:
        raise RuntimeError("readback failed")

    monkeypatch.setattr(
        "app.services.casper.loop.CasperReadbackService.record_readback",
        fake_readback,
    )

    assert await auto_readback("decision-2", "a" * 64) is None


def test_loop_status_exposes_deploy_and_readback_fields() -> None:
    reset_loop_state()
    loop_state.last_deploy_hash = "b" * 64
    loop_state.last_deploy_status = "confirmed"
    loop_state.last_readback_verified = True
    loop_state.last_readback_at = "2026-07-03T00:00:00+00:00"

    status = get_loop_status()

    assert status["lastDeployHash"] == "b" * 64
    assert status["lastDeployStatus"] == "confirmed"
    assert status["lastReadbackVerified"] is True
    assert status["lastReadbackAt"] == "2026-07-03T00:00:00+00:00"


def test_loop_state_defaults_include_readback_fields() -> None:
    state = LoopState()

    assert state.last_deploy_hash is None
    assert state.last_deploy_status is None
    assert state.last_readback_verified is None
    assert state.last_readback_at is None


@pytest.mark.asyncio
async def test_agent_loop_clears_stale_readback_on_failed_readback(monkeypatch) -> None:
    reset_loop_state()
    loop_state.running = True
    loop_state.interval_sec = 0
    loop_state.dry_run = False
    loop_state.last_readback_verified = True
    monkeypatch.setenv("CASPER_AGENT_LOOP_CYCLE_TIMEOUT_SEC", "2")
    get_settings.cache_clear()

    async def fake_evidence() -> dict[str, object]:
        return {"source": "test"}

    def fake_cycle(_: dict[str, object]) -> dict[str, object]:
        return {"status": "submitted", "deployHash": "c" * 64}

    async def fake_poll(_: str) -> str:
        return "confirmed"

    async def fake_readback(
        _: str,
        __: str,
        cycle_context: dict[str, str],
    ) -> dict[str, object] | None:
        assert cycle_context["origin"] == "scheduled_loop"
        return None

    async def stop_after_cycle(_: float) -> None:
        loop_state.running = False

    monkeypatch.setattr("app.services.casper.loop.fetch_treasury_yield", fake_evidence)
    monkeypatch.setattr(
        "app.services.casper.loop.CasperAgentRuntimeService.run_autonomous_cycle",
        fake_cycle,
    )
    monkeypatch.setattr("app.services.casper.loop.poll_deploy_status", fake_poll)
    monkeypatch.setattr("app.services.casper.loop.auto_readback", fake_readback)
    monkeypatch.setattr("app.services.casper.loop.asyncio.sleep", stop_after_cycle)

    await agent_loop()

    assert loop_state.last_deploy_hash == "c" * 64
    assert loop_state.last_deploy_status == "confirmed"
    assert loop_state.last_readback_verified is False
    assert loop_state.last_readback_at is not None


@pytest.mark.asyncio
async def test_agent_loop_pauses_without_retry_on_unknown_submit_outcome(monkeypatch) -> None:
    reset_loop_state()
    loop_state.running = True
    loop_state.interval_sec = 300
    loop_state.dry_run = False
    monkeypatch.setenv("CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED", "true")
    get_settings.cache_clear()

    async def fake_evidence() -> list[dict[str, object]]:
        return [{"source": "test"}]

    def fake_cycle(_: dict[str, object]) -> dict[str, object]:
        return {
            "status": "outcome_unknown",
            "decision": {"decisionId": "semantic-id"},
            "submissionGuard": {"status": "outcome_unknown"},
        }

    monkeypatch.setattr("app.services.casper.loop.fetch_treasury_yield", fake_evidence)
    monkeypatch.setattr(
        "app.services.casper.loop.CasperAgentRuntimeService.run_autonomous_cycle",
        fake_cycle,
    )

    await agent_loop()

    assert loop_state.running is False
    assert loop_state.cycle_count == 1
    assert loop_state.last_error == "casper_submission_outcome_unknown"


@pytest.mark.asyncio
async def test_agent_loop_records_one_sanitized_pre_runtime_failure(tmp_path, monkeypatch) -> None:
    from app.services.casper.ledger import CasperDecisionLedger

    reset_loop_state()
    loop_state.running = True
    loop_state.interval_sec = 0
    loop_state.dry_run = True
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "cycle-failure.sqlite3"))
    get_settings.cache_clear()

    async def failed_evidence() -> dict[str, object]:
        raise RuntimeError("provider fetch failed: " + "x" * 500)

    async def stop_after_failure(_: float) -> None:
        loop_state.running = False

    def runtime_must_not_run(_: dict[str, object]) -> dict[str, object]:
        raise AssertionError("runtime should not start after evidence failure")

    monkeypatch.setattr("app.services.casper.loop.fetch_treasury_yield", failed_evidence)
    monkeypatch.setattr(
        "app.services.casper.loop.CasperAgentRuntimeService.run_autonomous_cycle",
        runtime_must_not_run,
    )
    monkeypatch.setattr("app.services.casper.loop.asyncio.sleep", stop_after_failure)

    await agent_loop()

    events = CasperDecisionLedger.get_ledger_summary(limit=10)["events"]
    assert len(events) == 1
    assert events[0]["eventType"] == "casper_agent_cycle_failed"
    assert events[0]["payload"]["hardBlockers"] == ["casper_agent_cycle_failed"]
    assert len(events[0]["payload"]["error"]) == 200
    context = events[0]["payload"]["cycle"]["cycleContext"]
    assert context["origin"] == "scheduled_loop"
    assert context["cycleId"]


@pytest.mark.asyncio
async def test_agent_loop_records_runtime_failure(tmp_path, monkeypatch) -> None:
    from app.services.casper.ledger import CasperDecisionLedger

    reset_loop_state()
    loop_state.running = True
    loop_state.interval_sec = 0
    loop_state.dry_run = True
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "runtime-failure.sqlite3"))
    get_settings.cache_clear()

    async def evidence() -> dict[str, object]:
        return {"source": "test"}

    def failed_runtime(_: dict[str, object]) -> dict[str, object]:
        raise RuntimeError("guardrail runtime failed")

    async def stop_after_failure(_: float) -> None:
        loop_state.running = False

    monkeypatch.setattr("app.services.casper.loop.fetch_treasury_yield", evidence)
    monkeypatch.setattr(
        "app.services.casper.loop.CasperAgentRuntimeService.run_autonomous_cycle",
        failed_runtime,
    )
    monkeypatch.setattr("app.services.casper.loop.asyncio.sleep", stop_after_failure)

    await agent_loop()

    events = CasperDecisionLedger.get_ledger_summary(limit=10)["events"]
    assert len(events) == 1
    assert events[0]["eventType"] == "casper_agent_cycle_failed"
    assert events[0]["payload"]["hardBlockers"] == ["casper_agent_cycle_failed"]


@pytest.mark.asyncio
async def test_agent_loop_records_timeout_failure(tmp_path, monkeypatch) -> None:
    from app.services.casper.ledger import CasperDecisionLedger

    reset_loop_state()
    loop_state.running = True
    loop_state.interval_sec = 0
    loop_state.dry_run = True
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "timeout-failure.sqlite3"))
    monkeypatch.setenv("CASPER_AGENT_LOOP_CYCLE_TIMEOUT_SEC", "0.01")
    get_settings.cache_clear()

    async def evidence() -> dict[str, object]:
        return {"source": "test"}

    def slow_runtime(_: dict[str, object]) -> dict[str, object]:
        time.sleep(0.05)
        return {"status": "dry_run"}

    async def stop_after_timeout(_: float) -> None:
        loop_state.running = False

    monkeypatch.setattr("app.services.casper.loop.fetch_treasury_yield", evidence)
    monkeypatch.setattr(
        "app.services.casper.loop.CasperAgentRuntimeService.run_autonomous_cycle",
        slow_runtime,
    )
    monkeypatch.setattr("app.services.casper.loop.asyncio.sleep", stop_after_timeout)

    await agent_loop()

    events = CasperDecisionLedger.get_ledger_summary(limit=10)["events"]
    assert len(events) == 1
    assert events[0]["payload"]["hardBlockers"] == ["casper_agent_cycle_timeout"]


@pytest.mark.asyncio
async def test_loop_start_route_creates_and_stop_route_cancels_task(monkeypatch) -> None:
    reset_loop_state()
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))

    async def fake_agent_loop() -> None:
        await asyncio.sleep(30)

    monkeypatch.setattr("app.api.routes.dashboard.agent_loop", fake_agent_loop)

    start_status = await loop_start(request, interval_sec=1, dry_run=True)
    task = request.app.state.loop_task

    assert start_status["running"] is True
    assert task.done() is False

    stop_status = await loop_stop(request)

    assert stop_status["running"] is False
    assert request.app.state.loop_task is None
    assert task.cancelled() is True


@pytest.mark.asyncio
async def test_loop_stop_does_not_cancel_in_flight_submission() -> None:
    reset_loop_state()
    release = asyncio.Event()

    async def in_flight_cycle() -> None:
        await release.wait()

    task = asyncio.create_task(in_flight_cycle())
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(loop_task=task)))
    loop_state.running = True
    loop_state.cycle_in_progress = True

    status = await loop_stop(request)

    assert status["running"] is False
    assert status["stopping"] is True
    assert status["cycleInProgress"] is True
    assert task.done() is False

    loop_state.cycle_in_progress = False
    loop_state.stopping = False
    release.set()
    await task


@pytest.mark.asyncio
async def test_stop_during_evidence_fetch_prevents_late_live_submit(monkeypatch) -> None:
    reset_loop_state()
    loop_state.running = True
    loop_state.interval_sec = 21_600
    loop_state.dry_run = False
    evidence_started = asyncio.Event()
    release_evidence = asyncio.Event()
    runtime_calls: list[dict[str, object]] = []
    monkeypatch.setenv("CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED", "true")
    get_settings.cache_clear()

    async def delayed_evidence() -> dict[str, object]:
        evidence_started.set()
        await release_evidence.wait()
        return {"source": "test"}

    def fake_cycle(args: dict[str, object]) -> dict[str, object]:
        runtime_calls.append(args)
        return {"status": "submitted"}

    monkeypatch.setattr("app.services.casper.loop.fetch_treasury_yield", delayed_evidence)
    monkeypatch.setattr(
        "app.services.casper.loop.CasperAgentRuntimeService.run_autonomous_cycle",
        fake_cycle,
    )

    task = asyncio.create_task(agent_loop())
    await evidence_started.wait()
    status = stop_agent_loop()
    release_evidence.set()
    await task

    assert status["running"] is False
    assert runtime_calls == []
    assert loop_state.cycle_in_progress is False
    assert loop_state.stopping is False


@pytest.mark.asyncio
async def test_lifespan_stops_api_owned_loop_task(monkeypatch) -> None:
    reset_loop_state()
    monkeypatch.setenv("CASPER_AGENT_LOOP_ENABLED", "false")
    get_settings.cache_clear()
    app = SimpleNamespace(state=SimpleNamespace())
    release = asyncio.Event()

    async def api_owned_loop() -> None:
        try:
            await release.wait()
        finally:
            loop_state.running = False

    async with casper_lifespan(app):
        loop_state.running = True
        task = asyncio.create_task(api_owned_loop())
        app.state.loop_task = task

    assert task.cancelled() is True
    assert app.state.loop_task is None
    assert loop_state.running is False
