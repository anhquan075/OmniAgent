from app.core.settings import get_settings
from app.services.casper.ledger import CasperDecisionLedger


def _use_log(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    get_settings.cache_clear()
    CasperDecisionLedger.clear_current_log()


def _write_events(events: list[dict[str, object]]) -> None:
    CasperDecisionLedger.replace_events(events)


def _decision_event(decision_id: str, action: str = "approve", risk: int = 30) -> dict[str, object]:
    return {
        "network": "casper",
        "eventType": "casper_decision_recorded",
        "action": action,
        "createdAt": "2026-07-03T10:00:00+00:00",
        "payload": {
            "decision": {
                "decisionId": decision_id,
                "action": action,
                "riskScore": risk,
                "timestamp": "2026-07-03T10:00:00+00:00",
                "deployHash": "abc123",
                "proofDigest": "sha256:test",
                "policyGate": "approved",
            },
        },
    }


def test_receipts_endpoint_returns_events_from_ledger(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    _write_events([_decision_event("r-1"), _decision_event("r-2")])
    from app.api.routes.dashboard import _receipt_from_event
    ledger = CasperDecisionLedger.get_ledger_summary(limit=10)
    receipts = [_receipt_from_event(e) for e in ledger["events"]]
    assert len(receipts) == 2
    assert receipts[0]["decisionId"] in {"r-1", "r-2"}


def test_receipt_has_all_required_fields(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    _write_events([_decision_event("r-1")])
    from app.api.routes.dashboard import _receipt_from_event
    ledger = CasperDecisionLedger.get_ledger_summary(limit=10)
    receipt = _receipt_from_event(ledger["events"][0])
    for field in ["decisionId", "action", "riskScore", "timestamp", "deployHash", "proofDigest", "policyGate", "hardBlockers"]:
        assert field in receipt


def test_receipt_includes_submission_blockers(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    event = _decision_event("r-duplicate")
    event["payload"]["hardBlockers"] = ["casper_chain_duplicate_intent"]
    _write_events([event])

    from app.api.routes.dashboard import _receipt_from_event

    ledger = CasperDecisionLedger.get_ledger_summary(limit=10)
    receipt = _receipt_from_event(ledger["events"][0])

    assert receipt["hardBlockers"] == ["casper_chain_duplicate_intent"]


def test_receipt_caps_and_sanitizes_submission_blockers(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    event = _decision_event("r-many-blockers")
    event["payload"]["hardBlockers"] = ["x" * 120, 7, *[f"blocker-{index}" for index in range(40)]]
    _write_events([event])

    from app.api.routes.dashboard import _receipt_from_event

    ledger = CasperDecisionLedger.get_ledger_summary(limit=10)
    blockers = _receipt_from_event(ledger["events"][0])["hardBlockers"]

    assert len(blockers) == 32
    assert blockers[0] == "x" * 100
    assert all(isinstance(blocker, str) for blocker in blockers)


def test_receipts_limit_caps_result_count(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    _write_events([_decision_event(f"r-{i}") for i in range(5)])
    ledger = CasperDecisionLedger.get_ledger_summary(limit=2)
    assert len(ledger["events"]) == 2


def test_receipts_support_offset_pagination(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    _write_events([_decision_event(f"r-{i}") for i in range(5)])

    first_page = CasperDecisionLedger.get_ledger_summary(limit=2, offset=0)
    second_page = CasperDecisionLedger.get_ledger_summary(limit=2, offset=2)

    assert [event["payload"]["decision"]["decisionId"] for event in first_page["events"]] == ["r-4", "r-3"]
    assert [event["payload"]["decision"]["decisionId"] for event in second_page["events"]] == ["r-2", "r-1"]
    assert second_page["eventCount"] == 5
    assert second_page["offset"] == 2


def test_empty_ledger_returns_empty_list(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    ledger = CasperDecisionLedger.get_ledger_summary(limit=10)
    assert ledger["events"] == []
    assert ledger["eventCount"] == 0


def test_receipts_are_reverse_chronological(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    _write_events([
        {**_decision_event("old"), "createdAt": "2026-07-03T08:00:00+00:00"},
        {**_decision_event("new"), "createdAt": "2026-07-03T12:00:00+00:00"},
    ])
    ledger = CasperDecisionLedger.get_ledger_summary(limit=10)
    assert ledger["events"][0]["createdAt"] == "2026-07-03T12:00:00+00:00"


def test_transaction_hash_fallback_in_receipt(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    event = _decision_event("r-1")
    event["payload"]["decision"]["deployHash"] = None
    event["payload"]["decision"]["transactionHash"] = "tx-hash-123"
    _write_events([event])
    from app.api.routes.dashboard import _receipt_from_event
    ledger = CasperDecisionLedger.get_ledger_summary(limit=10)
    receipt = _receipt_from_event(ledger["events"][0])
    assert receipt["deployHash"] == "tx-hash-123"


def test_non_decision_event_produces_null_receipt_fields(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    _write_events([
        _decision_event("r-1"),
        {"network": "casper", "eventType": "other_event", "payload": {}},
    ])
    from app.api.routes.dashboard import _receipt_from_event
    ledger = CasperDecisionLedger.get_ledger_summary(limit=10)
    receipts = [_receipt_from_event(e) for e in ledger["events"]]
    decision_receipts = [r for r in receipts if r.get("decisionId")]
    assert len(decision_receipts) == 1
    assert decision_receipts[0]["decisionId"] == "r-1"


def test_receipt_includes_event_type_and_created_at(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    _write_events([_decision_event("r-1")])
    from app.api.routes.dashboard import _receipt_from_event
    ledger = CasperDecisionLedger.get_ledger_summary(limit=10)
    receipt = _receipt_from_event(ledger["events"][0])
    assert receipt["eventType"] == "casper_decision_recorded"
    assert receipt["createdAt"] is not None


def test_ledger_caps_read_to_max_events(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    monkeypatch.setenv("CASPER_LEDGER_MAX_EVENTS", "10")
    get_settings.cache_clear()
    _write_events([_decision_event(f"r-{i}") for i in range(50)])
    ledger = CasperDecisionLedger.get_ledger_summary(limit=100)
    assert ledger["eventCount"] == 10
    assert len(ledger["events"]) == 10


def test_ledger_rotates_on_append_when_over_limit(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    monkeypatch.setenv("CASPER_LEDGER_MAX_EVENTS", "5")
    get_settings.cache_clear()
    for i in range(10):
        CasperDecisionLedger.append_event({
            "eventType": "casper_decision_recorded",
            "payload": {"decision": {"decisionId": f"r-{i}"}},
        })
    ledger = CasperDecisionLedger.get_ledger_summary(limit=10)
    assert ledger["eventCount"] == 5
    assert ledger["events"][0]["payload"]["decision"]["decisionId"] == "r-9"


def test_ledger_persists_after_service_reload(tmp_path, monkeypatch) -> None:
    _use_log(tmp_path, monkeypatch)
    CasperDecisionLedger.append_event({
        "eventType": "casper_decision_recorded",
        "payload": {"decision": {"decisionId": "restart-safe"}},
    })

    get_settings.cache_clear()

    ledger = CasperDecisionLedger.get_ledger_summary(limit=10)
    assert ledger["eventCount"] == 1
    assert ledger["events"][0]["payload"]["decision"]["decisionId"] == "restart-safe"
