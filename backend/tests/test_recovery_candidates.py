from app.services.trading.recovery_candidates import TradeRecoveryCandidateService


def test_recovery_candidate_for_pending_receipt_is_read_only() -> None:
    candidates = TradeRecoveryCandidateService.list_candidates(
        receipt={"status": "pending"},
        submission={"tradeIntentId": "intent-1"},
    )

    assert candidates[0]["type"] == "receipt_pending"
    assert candidates[0]["safeNextAction"] == "poll_receipt"
    assert candidates[0]["canSubmitLiveTrade"] is False


def test_recovery_candidate_for_cmc_signal_stale() -> None:
    candidates = TradeRecoveryCandidateService.list_candidates(
        preflight={"blockers": [{"name": "cmc_agent_hub_signal", "ok": False}]},
        submission={"tradeIntentId": "intent-2"},
    )

    assert candidates[0]["type"] == "cmc_signal_stale"
    assert candidates[0]["canSubmitLiveTrade"] is False


def test_missing_confirmed_receipt_ledger_candidate() -> None:
    candidates = TradeRecoveryCandidateService.list_candidates(
        ledger={"events": []},
        receipt={"status": "confirmed", "txHash": "0xabc", "proof": {"valid": True}},
        submission={"tradeIntentId": "intent-3", "txHash": "0xabc"},
    )

    assert candidates[0]["type"] == "ledger_missing_receipt"
