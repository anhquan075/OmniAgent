from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
from threading import Barrier

import pytest

from app.core.settings import get_settings
from app.services.casper.client import CasperJsonRpcClient
from app.services.casper.submission_guard import CasperSubmissionGuard
from app.services.casper.submitter import CasperCliSubmitter


def decision(
    suffix: str = "a",
    *,
    action: str = "approve",
    risk_score: int = 22,
) -> dict[str, object]:
    return {
        "decisionId": f"decision-{suffix}",
        "timestamp": "2026-07-10T01:00:00+00:00",
        "proofDigest": "sha256:" + suffix * 64,
        "sourceHash": "sha256:" + suffix * 64,
        "action": action,
        "riskScore": risk_score,
        "policyGate": "approved",
        "policyTemplate": {
            "id": "rwa-collateral-v1",
            "allowedActions": ["hold", "approve", "block"],
            "warnRiskScore": 70,
            "blockRiskScore": 90,
        },
        "guardrailHash": "sha256:" + "1" * 64,
        "guardrails": {
            "status": "approved",
            "policyGate": {
                "verdict": "approved",
                "reasonCodes": ["policy_approved", "evidence_complete"],
            },
        },
    }


@pytest.fixture
def guard(tmp_path, monkeypatch) -> CasperSubmissionGuard:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "casper-ledger.sqlite3"))
    monkeypatch.setenv("CASPER_PAYMENT_AMOUNT_MOTES", "2500000000")
    monkeypatch.setenv("CASPER_LIVE_MIN_SUBMIT_INTERVAL_SEC", "0")
    monkeypatch.setenv("CASPER_LIVE_MAX_SUBMISSIONS_PER_UTC_DAY", "50")
    monkeypatch.setenv("CASPER_LIVE_DAILY_BUDGET_MOTES", "125000000000")
    get_settings.cache_clear()
    selected = CasperSubmissionGuard()
    selected.reset_for_tests()
    return selected


def complete(guard: CasperSubmissionGuard, reservation: dict[str, object]) -> None:
    key = str(reservation["idempotencyKey"])
    submitted = guard.mark_submitted(key, "a" * 64)
    assert submitted["status"] == "submitted"
    confirmed = guard.mark_confirmed(key)
    assert confirmed["status"] == "confirmed"


def test_semantic_duplicate_ignores_id_timestamp_and_proof_digest(
    guard: CasperSubmissionGuard,
) -> None:
    original = decision()
    duplicate = deepcopy(original)
    duplicate.update(
        {
            "decisionId": "a-different-generated-id",
            "timestamp": "2030-01-01T00:00:00+00:00",
            "proofDigest": "sha256:" + "9" * 64,
            "guardrailHash": "sha256:" + "8" * 64,
        }
    )
    duplicate["policyTemplate"]["allowedActions"] = ["block", "approve", "hold"]
    duplicate["guardrails"]["policyGate"]["reasonCodes"] = [
        "evidence_complete",
        "policy_approved",
    ]

    first = guard.reserve(original)
    second = guard.reserve(duplicate)

    assert first["allowed"] is True
    assert second["allowed"] is False
    assert second["idempotencyKey"] == first["idempotencyKey"]
    assert second["hardBlockers"] == [guard.DUPLICATE_BLOCKER]
    assert second["metadata"]["existingStatus"] == "reserved"


def test_economically_material_change_gets_a_new_reservation(
    guard: CasperSubmissionGuard,
) -> None:
    first = guard.reserve(decision())
    complete(guard, first)

    changed = guard.reserve(decision(risk_score=23))

    assert changed["allowed"] is True
    assert changed["idempotencyKey"] != first["idempotencyKey"]


def test_cooldown_blocks_a_distinct_intent(guard: CasperSubmissionGuard, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_LIVE_MIN_SUBMIT_INTERVAL_SEC", "60")
    get_settings.cache_clear()
    first = guard.reserve(decision())
    complete(guard, first)

    blocked = guard.reserve(decision("b"))

    assert blocked["allowed"] is False
    assert blocked["hardBlockers"] == [guard.COOLDOWN_BLOCKER]
    assert 1 <= blocked["metadata"]["cooldownRemainingSec"] <= 60


def test_daily_submission_count_is_enforced(guard: CasperSubmissionGuard, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_LIVE_MAX_SUBMISSIONS_PER_UTC_DAY", "2")
    get_settings.cache_clear()
    for suffix in ("a", "b"):
        reservation = guard.reserve(decision(suffix))
        assert reservation["allowed"] is True
        complete(guard, reservation)

    blocked = guard.reserve(decision("c"))

    assert blocked["allowed"] is False
    assert blocked["hardBlockers"] == [guard.DAILY_COUNT_BLOCKER]
    assert blocked["metadata"]["dailySubmissionCount"] == 2


def test_daily_mote_budget_is_enforced(guard: CasperSubmissionGuard, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_LIVE_DAILY_BUDGET_MOTES", "5000000000")
    get_settings.cache_clear()
    for suffix in ("a", "b"):
        reservation = guard.reserve(decision(suffix))
        assert reservation["allowed"] is True
        complete(guard, reservation)

    blocked = guard.reserve(decision("c"))

    assert blocked["allowed"] is False
    assert blocked["hardBlockers"] == [guard.DAILY_BUDGET_BLOCKER]
    assert blocked["metadata"]["dailyBudgetUsedMotes"] == 5_000_000_000
    assert blocked["metadata"]["dailyBudgetRemainingMotes"] == 0


def test_unknown_outcome_blocks_every_new_intent(guard: CasperSubmissionGuard) -> None:
    first = guard.reserve(decision())
    unknown = guard.mark_outcome_unknown(
        str(first["idempotencyKey"]),
        "RPC timed out after submit",
    )

    blocked = guard.reserve(decision("b"))

    assert unknown["status"] == "outcome_unknown"
    assert blocked["allowed"] is False
    assert blocked["hardBlockers"] == [guard.OUTSTANDING_BLOCKER]
    assert blocked["metadata"]["outstandingStatus"] == "outcome_unknown"
    assert blocked["metadata"]["outstandingIdempotencyKey"] == first["idempotencyKey"]


def test_submitted_but_unconfirmed_blocks_every_new_intent(guard: CasperSubmissionGuard) -> None:
    first = guard.reserve(decision())
    submitted = guard.mark_submitted(str(first["idempotencyKey"]), "a" * 64)

    blocked = guard.reserve(decision("b"))

    assert submitted["status"] == "submitted"
    assert blocked["allowed"] is False
    assert blocked["hardBlockers"] == [guard.OUTSTANDING_BLOCKER]
    assert blocked["metadata"]["outstandingStatus"] == "submitted"


def test_failed_is_terminal_for_duplicate_but_releases_outstanding_lock(
    guard: CasperSubmissionGuard,
) -> None:
    first = guard.reserve(decision())
    failed = guard.mark_failed(str(first["idempotencyKey"]), "client rejected request")

    duplicate = guard.reserve(decision())
    distinct = guard.reserve(decision("b"))

    assert failed["status"] == "failed"
    assert failed["metadata"]["lastError"] == "client rejected request"
    assert duplicate["hardBlockers"] == [guard.DUPLICATE_BLOCKER]
    assert duplicate["metadata"]["existingStatus"] == "failed"
    assert distinct["allowed"] is True


def test_duplicate_state_survives_settings_cache_and_service_restart(
    guard: CasperSubmissionGuard,
) -> None:
    first = guard.reserve(decision())
    complete(guard, first)
    get_settings.cache_clear()

    restarted_service = CasperSubmissionGuard()
    blocked = restarted_service.reserve(decision())

    assert blocked["allowed"] is False
    assert blocked["hardBlockers"] == [guard.DUPLICATE_BLOCKER]
    assert blocked["metadata"]["existingStatus"] == "confirmed"


def test_concurrent_distinct_reservations_admit_exactly_one(
    guard: CasperSubmissionGuard,
) -> None:
    workers = 8
    barrier = Barrier(workers)

    def attempt(index: int) -> dict[str, object]:
        barrier.wait()
        suffix = chr(ord("a") + index)
        return guard.reserve(decision(suffix))

    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(attempt, range(workers)))

    allowed = [result for result in results if result["allowed"]]
    blocked = [result for result in results if not result["allowed"]]
    assert len(allowed) == 1
    assert len(blocked) == workers - 1
    assert all(result["hardBlockers"] == [guard.OUTSTANDING_BLOCKER] for result in blocked)


def test_chain_guard_blocks_same_source_after_local_state_loss(
    guard: CasperSubmissionGuard,
    monkeypatch,
) -> None:
    monkeypatch.setenv("CASPER_LIVE_REQUIRE_CHAIN_DEDUPE", "true")
    monkeypatch.setenv("CASPER_LIVE_MIN_SUBMIT_INTERVAL_SEC", "0")
    get_settings.cache_clear()
    source_hash = str(decision()["sourceHash"])
    receipt = (
        "prior-id|approve|22|sha256:proof|sha256:rationale|"
        f"{source_hash}|2026-07-01T00:00:00+00:00|approved||sha256:guard"
    )
    monkeypatch.setattr(
        CasperCliSubmitter,
        "query_latest_decision_id",
        staticmethod(lambda: {"status": "ready", "decisionId": "prior-id", "hardBlockers": []}),
    )
    monkeypatch.setattr(
        CasperCliSubmitter,
        "query_decision_receipt",
        staticmethod(lambda _: {"status": "ready", "decisionReceipt": receipt, "hardBlockers": []}),
    )

    result = guard.check_chain_state(decision())

    assert result["allowed"] is False
    assert result["hardBlockers"] == [guard.CHAIN_DUPLICATE_BLOCKER]


def test_chain_guard_fails_closed_when_latest_state_is_unavailable(
    guard: CasperSubmissionGuard,
    monkeypatch,
) -> None:
    monkeypatch.setenv("CASPER_LIVE_REQUIRE_CHAIN_DEDUPE", "true")
    get_settings.cache_clear()
    monkeypatch.setattr(
        CasperCliSubmitter,
        "query_latest_decision_id",
        staticmethod(lambda: {"status": "blocked", "decisionId": None, "hardBlockers": ["rpc_down"]}),
    )

    result = guard.check_chain_state(decision())

    assert result["allowed"] is False
    assert result["hardBlockers"] == [guard.CHAIN_STATE_BLOCKER]


def test_chain_guard_cooldown_blocks_distinct_recent_intent(
    guard: CasperSubmissionGuard,
    monkeypatch,
) -> None:
    monkeypatch.setenv("CASPER_LIVE_REQUIRE_CHAIN_DEDUPE", "true")
    monkeypatch.setenv("CASPER_LIVE_MIN_SUBMIT_INTERVAL_SEC", "21600")
    get_settings.cache_clear()
    receipt = (
        "prior-id|approve|22|sha256:proof|sha256:rationale|sha256:old-source|"
        f"{datetime.now(timezone.utc).isoformat()}|approved||sha256:guard"
    )
    monkeypatch.setattr(
        CasperCliSubmitter,
        "query_latest_decision_id",
        staticmethod(lambda: {"status": "ready", "decisionId": "prior-id", "hardBlockers": []}),
    )
    monkeypatch.setattr(
        CasperCliSubmitter,
        "query_decision_receipt",
        staticmethod(lambda _: {"status": "ready", "decisionReceipt": receipt, "hardBlockers": []}),
    )

    result = guard.check_chain_state(decision())

    assert result["allowed"] is False
    assert result["hardBlockers"] == [guard.CHAIN_COOLDOWN_BLOCKER]


def test_chain_guard_blocks_historical_semantic_id_before_latest_check(
    guard: CasperSubmissionGuard,
    monkeypatch,
) -> None:
    monkeypatch.setenv("CASPER_LIVE_REQUIRE_CHAIN_DEDUPE", "true")
    get_settings.cache_clear()
    candidate = decision()
    candidate["decisionId"] = guard.semantic_decision_id(candidate)
    receipt = (
        f"{candidate['decisionId']}|approve|22|sha256:proof|sha256:rationale|"
        f"{candidate['sourceHash']}|2026-07-01T00:00:00+00:00|approved||sha256:guard"
    )
    monkeypatch.setattr(
        CasperJsonRpcClient,
        "probe_decision_receipt_sync",
        staticmethod(lambda _: {
            "status": "found",
            "decisionReceipt": receipt,
            "hardBlockers": [],
        }),
    )
    monkeypatch.setattr(
        CasperCliSubmitter,
        "query_latest_decision_id",
        staticmethod(lambda: (_ for _ in ()).throw(AssertionError("latest check should not run"))),
    )

    result = guard.check_chain_state(candidate)

    assert result["allowed"] is False
    assert result["hardBlockers"] == [guard.CHAIN_DUPLICATE_BLOCKER]
