from app.services.trading.trade_work_order import TradeWorkOrderService


def test_cycle_projects_trade_work_order_lifecycle() -> None:
    lifecycle = TradeWorkOrderService.from_cycle({
        "tradeIntentId": "intent-1",
        "status": "ready",
        "stages": [
            {"stage": "sense", "state": "completed", "note": "cmc ready"},
            {"stage": "quote", "state": "completed", "note": "router"},
            {"stage": "decide", "state": "approved", "note": "guardrails pass"},
            {"stage": "sign", "state": "ready", "note": "ready for twak"},
        ],
    })

    assert lifecycle["id"] == "intent-1"
    assert lifecycle["state"] == "route_built"
    assert lifecycle["terminal"] is False
    assert lifecycle["hardBlockers"] == []


def test_cycle_requires_submitted_sign_stage_for_twak_submitted() -> None:
    lifecycle = TradeWorkOrderService.from_cycle({
        "tradeIntentId": "intent-1",
        "status": "submitted",
        "stages": [
            {"stage": "sense", "state": "completed", "note": "cmc ready"},
            {"stage": "quote", "state": "completed", "note": "router"},
            {"stage": "decide", "state": "approved", "note": "guardrails pass"},
            {"stage": "sign", "state": "submitted", "note": "0xabc"},
        ],
    })

    assert lifecycle["state"] == "twak_submitted"


def test_proof_bundle_projection_hard_blocks_on_preflight() -> None:
    lifecycle = TradeWorkOrderService.from_proof_bundle(
        {"blockers": [{"name": "cmc_agent_hub_signal", "ok": False}]},
        {"control": {"emergencyPaused": False}},
        None,
        None,
    )

    assert lifecycle["state"] == "blocked"
    assert lifecycle["hardBlockers"] == ["cmc_agent_hub_signal"]
    assert any(step["status"] == "blocked" for step in lifecycle["steps"])


def test_receipt_valid_projection_reaches_receipt_confirmed() -> None:
    lifecycle = TradeWorkOrderService.from_proof_bundle(
        {"blockers": [], "checks": []},
        {"control": {"emergencyPaused": False}},
        {"status": "confirmed", "proof": {"valid": True}},
        {"tradeIntentId": "intent-2", "txHash": "0xabc"},
    )

    assert lifecycle["state"] == "receipt_confirmed"
    assert lifecycle["terminal"] is True
