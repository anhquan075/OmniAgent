import json

from fastapi.testclient import TestClient

from app.core.settings import get_settings
from app.main import create_app
from app.services.casper.cycle_history import CasperCycleHistoryService
from app.services.casper.ledger import CasperDecisionLedger


def _use_ledger(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "cycle-history.sqlite3"))
    get_settings.cache_clear()
    CasperDecisionLedger.clear_current_log()


def _decision_event(
    cycle_id: str | None,
    decision_id: str,
    *,
    deploy_hash: str | None = None,
    event_type: str = "casper_decision_submitted",
    created_at: str = "2026-07-10T10:00:00+00:00",
    blockers: list[str] | None = None,
) -> dict[str, object]:
    cycle = {
        "cycleContext": {
            "cycleId": cycle_id,
            "origin": "scheduled_loop",
            "startedAt": created_at,
        },
        "toolsUsed": [
            "casper_rwa_evidence",
            "casper_guardrails",
            "casper_live_preflight",
            "casper_record_decision",
        ],
    } if cycle_id else {}
    return {
        "eventType": event_type,
        "action": "hold",
        "createdAt": created_at,
        "payload": {
            "decision": {
                "decisionId": decision_id,
                "action": "hold",
                "riskScore": 41,
                "rationale": "Hold while the collateral proof is checked.",
                "rationaleHash": "sha256:rationale",
                "sourceHash": "sha256:source",
                "proofDigest": "sha256:proof",
                "policyGate": "approved",
                "deployHash": deploy_hash,
                "evidenceBundle": {
                    "status": "ready",
                    "riskScore": 41,
                    "sourceHash": "sha256:source",
                    "sources": [{"url": "https://example.gov/evidence"}],
                },
                "guardrails": {
                    "status": "approved",
                    "guardrailHash": "sha256:guardrail",
                    "roles": [{
                        "agentRole": "critic",
                        "verdict": "approved",
                        "confidence": 0.9,
                        "reasonCodes": ["risk_within_threshold"],
                    }],
                },
            },
            "submitted": event_type == "casper_decision_submitted",
            "submitStatus": "submitted" if event_type == "casper_decision_submitted" else None,
            "hardBlockers": blockers or [],
            "preflight": {
                "status": "ready",
                "rpcReachable": True,
                "liveSubmitEnabled": True,
                "hardBlockers": [],
            },
            "cycle": cycle,
        },
    }


def _readback_event(
    cycle_id: str | None,
    decision_id: str,
    deploy_hash: str,
    *,
    created_at: str = "2026-07-10T10:05:00+00:00",
) -> dict[str, object]:
    event = _decision_event(
        cycle_id,
        decision_id,
        deploy_hash=deploy_hash,
        event_type="casper_decision_readback_verified",
        created_at=created_at,
    )
    payload = event["payload"]
    decision = payload["decision"]
    decision["deployStatus"] = {
        "status": "confirmed",
        "source": "casper_json_rpc",
        "cliCommand": "must-not-leak",
    }
    decision["readback"] = {
        "proofDigest": "sha256:proof",
        "receiptVerified": True,
        "source": "casper_json_rpc_query_global_state",
        "stateRootHash": "state-root",
        "observedAt": created_at,
        "cliCommand": "must-not-leak",
    }
    payload["readbackVerified"] = True
    payload["submitted"] = None
    if cycle_id:
        payload["cycle"]["toolsUsed"].append("casper_record_readback")
    return event


def test_cycle_history_keeps_duplicate_decisions_and_merges_exact_readback(
    tmp_path,
    monkeypatch,
) -> None:
    _use_ledger(tmp_path, monkeypatch)
    CasperDecisionLedger.append_event(_decision_event(
        "cycle-a",
        "same-semantic-decision",
        deploy_hash="a" * 64,
        created_at="2026-07-10T10:00:00+00:00",
    ))
    CasperDecisionLedger.append_event(_decision_event(
        "cycle-b",
        "same-semantic-decision",
        event_type="casper_decision_live_submit_blocked",
        created_at="2026-07-10T10:30:00+00:00",
        blockers=["casper_duplicate_decision_on_chain"],
    ))
    CasperDecisionLedger.append_event(_readback_event(
        "cycle-a",
        "same-semantic-decision",
        "a" * 64,
    ))

    result = CasperCycleHistoryService.get_cycle_history()

    assert result["total"] == 2
    assert [cycle["cycleId"] for cycle in result["cycles"]] == ["cycle-b", "cycle-a"]
    blocked, verified = result["cycles"]
    assert blocked["decisionId"] == verified["decisionId"] == "same-semantic-decision"
    assert blocked["status"] == "blocked"
    assert blocked["bundle"]["readback"]["status"] == "skipped"
    assert verified["status"] == "verified"
    assert verified["bundle"]["deployStatus"]["status"] == "confirmed"
    assert verified["bundle"]["readback"]["verified"] is True
    readback_call = verified["bundle"]["cycle"]["toolActivity"][-1]
    assert readback_call["tool"] == "casper_record_readback"
    assert readback_call["invoked"] is True


def test_legacy_cycles_use_stable_event_ids_and_unique_deploy_merge(tmp_path, monkeypatch) -> None:
    _use_ledger(tmp_path, monkeypatch)
    first = CasperDecisionLedger.append_event(_decision_event(
        None,
        "repeated-id",
        deploy_hash="a" * 64,
    ))
    second = CasperDecisionLedger.append_event(_decision_event(
        None,
        "repeated-id",
        deploy_hash="b" * 64,
        created_at="2026-07-10T11:00:00+00:00",
    ))
    CasperDecisionLedger.append_event(_readback_event(None, "repeated-id", "a" * 64))

    result = CasperCycleHistoryService.get_cycle_history()

    by_cycle = {cycle["cycleId"]: cycle for cycle in result["cycles"]}
    assert f"event-{first['eventId']}" in by_cycle
    assert f"event-{second['eventId']}" in by_cycle
    assert by_cycle[f"event-{first['eventId']}"]["status"] == "verified"
    assert by_cycle[f"event-{second['eventId']}"]["status"] == "submitted"


def test_failed_cycle_is_included_with_skipped_downstream_tools(tmp_path, monkeypatch) -> None:
    _use_ledger(tmp_path, monkeypatch)
    event = CasperDecisionLedger.append_event({
        "eventType": "casper_agent_cycle_failed",
        "createdAt": "2026-07-10T12:00:00+00:00",
        "payload": {
            "cycle": {
                "cycleContext": {
                    "cycleId": "failed-cycle",
                    "origin": "scheduled_loop",
                    "startedAt": "2026-07-10T12:00:00+00:00",
                },
                "toolsUsed": ["casper_rwa_evidence"],
            },
            "hardBlockers": ["casper_agent_cycle_failed"],
            "error": "provider-secret-must-not-leak",
        },
    })

    cycle = CasperCycleHistoryService.get_cycle_history()["cycles"][0]

    assert event["eventId"] == cycle["streamMeta"]["sequence"]
    assert cycle["status"] == "failed"
    assert cycle["hardBlockers"] == ["casper_agent_cycle_failed"]
    tool_activity = cycle["bundle"]["cycle"]["toolActivity"]
    assert tool_activity[0]["status"] == "failed"
    assert tool_activity[0]["invoked"] is True
    assert all(call["status"] == "skipped" for call in tool_activity[1:])
    assert "provider-secret-must-not-leak" not in json.dumps(cycle)


def test_completed_worker_replaces_earlier_timeout_for_same_cycle(tmp_path, monkeypatch) -> None:
    _use_ledger(tmp_path, monkeypatch)
    cycle_id = "timed-worker-cycle"
    CasperDecisionLedger.append_event({
        "eventType": "casper_agent_cycle_failed",
        "createdAt": "2026-07-10T12:00:00+00:00",
        "payload": {
            "cycle": {
                "cycleContext": {
                    "cycleId": cycle_id,
                    "origin": "scheduled_loop",
                    "startedAt": "2026-07-10T12:00:00+00:00",
                },
                "toolsUsed": ["casper_rwa_evidence"],
            },
            "hardBlockers": ["casper_agent_cycle_timeout"],
        },
    })
    CasperDecisionLedger.append_event(_decision_event(
        cycle_id,
        "completed-after-timeout",
        event_type="casper_decision_dry_run",
        created_at="2026-07-10T12:00:01+00:00",
    ))

    result = CasperCycleHistoryService.get_cycle_history()

    assert result["total"] == 1
    assert result["cycles"][0]["cycleId"] == cycle_id
    assert result["cycles"][0]["decisionId"] == "completed-after-timeout"
    assert result["cycles"][0]["status"] == "dry_run"


def test_cycle_projection_whitelists_history_without_secret_fields(tmp_path, monkeypatch) -> None:
    _use_ledger(tmp_path, monkeypatch)
    event = _decision_event("safe-cycle", "safe-decision", deploy_hash="a" * 64)
    event["payload"].update({
        "cliCommand": "casper-client --secret-key /secret.pem",
        "env": {"CASPER_SECRET_KEY_PATH": "/secret.pem"},
        "rawProviderText": "provider-secret-must-not-leak",
    })
    event["payload"]["preflight"].update({
        "account": {"signer": {"path": "/secret.pem"}},
        "rpcProbe": {"cliCommand": "must-not-leak"},
    })
    event["payload"]["decision"].update({
        "privateKey": "must-not-leak",
        "rawProviderText": "provider-secret-must-not-leak",
        "rationale": "r" * 5_000,
    })
    event["payload"]["decision"]["evidenceBundle"]["sources"] = [{
        "url": "https://username:credential@example.gov/evidence",
    }]
    CasperDecisionLedger.append_event(event)

    serialized = json.dumps(CasperCycleHistoryService.get_cycle_history())

    assert "cliCommand" not in serialized
    assert "privateKey" not in serialized
    assert "CASPER_SECRET_KEY_PATH" not in serialized
    assert "/secret.pem" not in serialized
    assert "rawProviderText" not in serialized
    assert "provider-secret-must-not-leak" not in serialized
    assert "credential" not in serialized
    cycle = CasperCycleHistoryService.get_cycle_history()["cycles"][0]
    assert len(cycle["bundle"]["latestDecision"]["rationale"]) == 512
    assert cycle["bundle"]["latestDecision"]["evidenceBundle"]["sources"] == [{}]


def test_cycles_api_is_session_protected_and_paginates_cycles(tmp_path, monkeypatch) -> None:
    _use_ledger(tmp_path, monkeypatch)
    for index in range(3):
        CasperDecisionLedger.append_event(_decision_event(
            f"cycle-{index}",
            f"decision-{index}",
            event_type="casper_decision_dry_run",
            created_at=f"2026-07-10T1{index}:00:00+00:00",
        ))
    CasperDecisionLedger.append_event({
        "eventType": "casper_agent_cycle_failed",
        "payload": {"cycle": {}, "hardBlockers": ["casper_agent_cycle_failed"]},
    })
    client = TestClient(create_app())

    assert client.get("/api/dashboard/cycles").status_code == 401
    client.get("/api/session")
    response = client.get("/api/dashboard/cycles?limit=2&offset=1")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    assert body["total"] == 4
    assert body["limit"] == 2
    assert body["offset"] == 1
    assert body["hasPrevious"] is True
    assert body["hasNext"] is True
    assert client.get("/api/dashboard/cycles?limit=100").json()["limit"] == 25


def test_receipts_api_filters_failed_cycles_without_empty_decisions(tmp_path, monkeypatch) -> None:
    _use_ledger(tmp_path, monkeypatch)
    CasperDecisionLedger.append_event(_decision_event(
        "receipt-cycle",
        "receipt-decision",
        event_type="casper_decision_dry_run",
    ))
    CasperDecisionLedger.append_event({
        "eventType": "casper_agent_cycle_failed",
        "payload": {"cycle": {}, "hardBlockers": ["casper_agent_cycle_failed"]},
    })
    client = TestClient(create_app())
    client.get("/api/session")

    body = client.get("/api/dashboard/receipts").json()

    assert body["count"] == body["total"] == 1
    assert body["receipts"][0]["decisionId"] == "receipt-decision"
