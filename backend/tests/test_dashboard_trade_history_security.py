from fastapi.testclient import TestClient

from app.core.security_middleware import rate_limit_buckets
from app.core.settings import get_settings
from app.main import app
from app.services.shared.ledger import TradeLedger


def test_dashboard_trades_returns_full_executed_history(monkeypatch, tmp_path) -> None:
    tx_a = "0x" + "a" * 64
    tx_b = "0x" + "b" * 64
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    TradeLedger.append_event({
        "eventType": "trade_executed",
        "tradeIntentId": "intent-a",
        "txHash": tx_a,
        "createdAt": "2026-06-09T00:00:00+00:00",
        "payload": {
            "bridgeMode": "rest",
            "walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
            "cmcAgentHubSignal": {"toolName": "cmc.signal", "serverVerified": True},
        },
    })
    TradeLedger.append_event({
        "eventType": "autonomous_cycle_completed",
        "tradeIntentId": "intent-a",
        "createdAt": "2026-06-09T00:01:00+00:00",
        "payload": {
            "symbol": "CAKE",
            "side": "buy",
            "amountUsd": 25,
            "execution": {"status": "submitted", "txHash": tx_a},
        },
    })
    TradeLedger.append_event({
        "eventType": "trade_executed",
        "tradeIntentId": "intent-b",
        "txHash": tx_b,
        "createdAt": "2026-06-09T00:02:00+00:00",
        "payload": {"bridgeMode": "cli"},
    })
    TradeLedger.append_event({
        "eventType": "trade_receipt_confirmed",
        "tradeIntentId": "intent-a",
        "txHash": tx_a,
        "createdAt": "2026-06-09T00:03:00+00:00",
        "payload": {
            "blockNumber": 123,
            "from": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
            "to": "0x10ED43C718714eb63d5aA57B78B54704E256024E",
            "proof": {"valid": True},
        },
    })

    client = TestClient(app)
    assert client.get("/api/dashboard/trades").status_code == 401
    client.get("/api/session")
    response = client.get("/api/dashboard/trades?limit=500")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["count"] == 2
    assert body["hasMore"] is False
    assert body["trades"][0]["txHash"] == tx_a
    assert body["trades"][0]["status"] == "confirmed"
    assert body["trades"][0]["symbol"] == "CAKE"
    assert body["trades"][0]["cmcTool"] == "cmc.signal"
    assert body["trades"][0]["cmcServerVerified"] is True
    assert body["trades"][0]["receiptProofValid"] is True
    assert body["trades"][0]["blockNumber"] == 123
    assert body["trades"][1]["txHash"] == tx_b
    get_settings.cache_clear()


def test_api_security_headers_and_payload_limit(monkeypatch) -> None:
    monkeypatch.setenv("API_MAX_BODY_BYTES", "16")
    get_settings.cache_clear()
    client = TestClient(app)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.headers["X-Content-Type-Options"] == "nosniff"
    assert health.headers["X-Frame-Options"] == "DENY"
    assert health.headers["Cache-Control"] == "no-store"

    too_large = client.post("/api/mcp", content="x" * 32, headers={"content-type": "application/json"})
    assert too_large.status_code == 413
    get_settings.cache_clear()


def test_api_rate_limit_blocks_session_spam(monkeypatch) -> None:
    monkeypatch.setenv("API_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("API_SESSION_RATE_LIMIT_REQUESTS", "2")
    monkeypatch.setenv("API_RATE_LIMIT_WINDOW_SEC", "60")
    get_settings.cache_clear()
    rate_limit_buckets.clear()
    client = TestClient(app)

    assert client.get("/api/session").status_code == 200
    assert client.get("/api/session").status_code == 200
    blocked = client.get("/api/session")

    assert blocked.status_code == 429
    assert blocked.json()["detail"] == "Rate limit exceeded"
    assert blocked.headers["Retry-After"]
    rate_limit_buckets.clear()
    get_settings.cache_clear()


def test_api_rejects_untrusted_host(monkeypatch) -> None:
    monkeypatch.setenv("API_TRUSTED_HOSTS", "api.omniagent.example")
    get_settings.cache_clear()
    client = TestClient(app)

    response = client.get("/api/health", headers={"host": "attacker.example"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Host is not trusted"
    get_settings.cache_clear()


def test_api_accepts_railway_trusted_host_patterns(monkeypatch) -> None:
    monkeypatch.setenv("API_TRUSTED_HOSTS", "*.up.railway.app,*.railway.internal")
    get_settings.cache_clear()
    client = TestClient(app)

    frontend = client.get("/api/session", headers={"host": "omniagent-frontend-production.up.railway.app"})
    internal = client.get("/api/session", headers={"host": "backend.railway.internal:8000"})
    attacker = client.get("/api/session", headers={"host": "attackerup.railway.app"})

    assert frontend.status_code == 200
    assert internal.status_code == 200
    assert attacker.status_code == 400
    assert attacker.json()["detail"] == "Host is not trusted"
    get_settings.cache_clear()
