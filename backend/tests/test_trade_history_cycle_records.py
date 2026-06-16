from app.core.settings import get_settings
from app.services.shared.ledger import TradeLedger
from app.services.shared.trade_history import TradeHistoryService


def test_trade_history_returns_guarded_cycle_records(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()

    TradeLedger.append_event({
        "eventType": "autonomous_cycle_completed",
        "tradeIntentId": "intent-cycle",
        "createdAt": "2026-06-16T10:24:58+00:00",
        "payload": {
            "symbol": "CAKE",
            "side": "buy",
            "amountUsd": 25,
            "status": "blocked",
            "strategyDecision": {
                "source": "deterministic",
                "decision": {
                    "action": "hold",
                    "confidence": 0.35,
                    "rationale": "Guarded because proof gates are incomplete.",
                },
            },
        },
    })

    body = TradeHistoryService.get_executed_trades(limit=10)

    assert body["total"] == 1
    assert body["count"] == 1
    assert body["recordCounts"] == {"trade": 0, "cycle": 1}
    record = body["trades"][0]
    assert record["recordType"] == "cycle"
    assert record["executionKind"] == "guarded_cycle"
    assert record["status"] == "blocked"
    assert record["txHash"] is None
    assert record["symbol"] == "CAKE"
    assert record["side"] == "buy"
    assert record["amountUsd"] == 25
    get_settings.cache_clear()


def test_trade_history_merges_trade_into_prior_cycle_record(monkeypatch, tmp_path) -> None:
    tx_hash = "0x" + "a" * 64
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()

    TradeLedger.append_event({
        "eventType": "autonomous_cycle_completed",
        "tradeIntentId": "intent-merge",
        "createdAt": "2026-06-16T10:24:58+00:00",
        "payload": {"symbol": "CAKE", "side": "buy", "amountUsd": 25, "status": "blocked"},
    })
    TradeLedger.append_event({
        "eventType": "trade_executed",
        "tradeIntentId": "intent-merge",
        "txHash": tx_hash,
        "createdAt": "2026-06-16T10:25:58+00:00",
        "payload": {"bridgeMode": "rest"},
    })

    body = TradeHistoryService.get_executed_trades(limit=10)

    assert body["total"] == 1
    assert body["recordCounts"] == {"trade": 1, "cycle": 0}
    record = body["trades"][0]
    assert record["recordType"] == "trade"
    assert record["executionKind"] == "onchain_trade"
    assert record["status"] == "submitted"
    assert record["txHash"] == tx_hash
    assert record["symbol"] == "CAKE"
    get_settings.cache_clear()
