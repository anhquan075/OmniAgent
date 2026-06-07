from app.services.trading.proof_digest import TradeProofDigestService
from app.services.trading.proof_score import TradeProofScoreService


def test_score_never_passes_when_receipt_is_pending() -> None:
    score = TradeProofScoreService.score(
        preflight={"blockers": [], "checks": [{"name": "cmc", "ok": True}]},
        receipt={"status": "pending", "proof": {"valid": False, "reasons": ["receipt_pending"]}},
        submission={"payload": {"cmcAgentHubSignal": {"ready": True, "serverVerified": True}}},
    )

    assert score["status"] == "blocked"
    assert score["hardBlocked"] is True
    assert "receipt_pending" in score["hardBlockers"]


def test_score_hard_blocks_on_wallet_mismatch() -> None:
    score = TradeProofScoreService.score(
        receipt={
            "status": "confirmed",
            "proof": {"valid": False, "reasons": ["from_wallet_mismatch"]},
        },
    )

    assert score["hardBlocked"] is True
    assert "from_wallet_mismatch" in score["hardBlockers"]
    assert score["status"] == "blocked"


def test_digest_is_deterministic_and_scrubs_secrets() -> None:
    base = {
        "tradeIntentId": "intent-1",
        "txHash": "0x" + "1" * 64,
        "payload": {
            "cmcAgentHubSignal": {
                "toolName": "daily_market_overview",
                "ready": True,
                "serverVerified": True,
                "parsedContent": {"price": 1, "TW_HMAC_SECRET": "secret-a"},
            }
        },
    }
    changed_secret = {
        **base,
        "payload": {
            "cmcAgentHubSignal": {
                **base["payload"]["cmcAgentHubSignal"],
                "parsedContent": {"price": 1, "TW_HMAC_SECRET": "secret-b"},
            }
        },
    }

    digest_a = TradeProofDigestService.digest(submission=base)
    digest_b = TradeProofDigestService.digest(submission=changed_secret)

    assert digest_a == digest_b
    assert len(digest_a) == 64


def test_duplicate_status_does_not_match_current_submission_only() -> None:
    submission = {
        "tradeIntentId": "intent-1",
        "txHash": "0x" + "1" * 64,
        "payload": {"cmcAgentHubSignal": {"ready": True, "serverVerified": True}},
    }
    digest = TradeProofDigestService.digest(submission=submission)
    duplicate = TradeProofDigestService.duplicate_status(
        digest,
        {"events": [submission]},
        current_tx_hash=submission["txHash"],
        current_trade_intent_id=submission["tradeIntentId"],
    )

    assert duplicate["duplicate"] is False


def test_duplicate_status_does_not_match_current_digest_event_only() -> None:
    submission = {
        "eventType": "trade_executed",
        "tradeIntentId": "intent-1",
        "txHash": "0x" + "1" * 64,
        "payload": {"cmcAgentHubSignal": {"ready": True, "serverVerified": True}},
    }
    digest = TradeProofDigestService.digest(submission=submission)
    current = {**submission, "payload": {**submission["payload"], "proofDigest": digest}}

    duplicate = TradeProofDigestService.duplicate_status(
        digest,
        {"events": [current]},
        current_tx_hash=current["txHash"],
        current_trade_intent_id=current["tradeIntentId"],
    )

    assert duplicate["duplicate"] is False


def test_duplicate_status_detects_second_same_tx_event() -> None:
    tx_hash = "0x" + "1" * 64
    current = {"eventType": "trade_executed", "tradeIntentId": "intent-1", "txHash": tx_hash}
    previous = {"eventType": "trade_receipt_confirmed", "tradeIntentId": "intent-older", "txHash": tx_hash}
    digest = TradeProofDigestService.digest(submission=current)

    duplicate = TradeProofDigestService.duplicate_status(
        digest,
        {"events": [current, previous]},
        current_tx_hash=tx_hash,
        current_trade_intent_id="intent-1",
    )

    assert duplicate["duplicate"] is True
    assert duplicate["matches"][0]["tradeIntentId"] == "intent-older"
