import asyncio
from typing import Any

from app.services.container import ServiceContainer
from app.services.adapters.runtime import DynamicAgentAdapterRegistry, FastApiBnbAgentAdapter
from app.core.settings import get_settings
from app.services.shared.ledger import TradeLedger
from app.services.mcp.tools import McpToolRegistry
from app.services.trading.risk import RiskCheckService


def test_service_container_exposes_class_services() -> None:
    container = ServiceContainer.default()

    assert container.ledger is TradeLedger
    assert container.mcp_tools is McpToolRegistry
    assert container.adapter_registry is DynamicAgentAdapterRegistry
    assert container.agent_adapter is FastApiBnbAgentAdapter
    assert container.trust_wallet.__name__ == "TrustWalletBridge"
    assert container.autonomous_agent.__name__ == "AutonomousTradingAgent"


def test_ledger_class_service(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    event = {"eventType": "oop_contract_smoke", "payload": {"ok": True}}

    ledger_event = TradeLedger.append_event(event)
    summary = TradeLedger.get_ledger_summary(limit=5)

    assert ledger_event["eventType"] == "oop_contract_smoke"
    assert summary["events"][0]["payload"] == {"ok": True}


def test_ledger_confirmed_trade_count_dedupes_proofs(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    tx_hash = "0x" + "1" * 64
    event = {
        "eventType": "trade_receipt_confirmed",
        "tradeIntentId": "intent-1",
        "txHash": tx_hash,
        "createdAt": "2026-06-07T00:00:00+00:00",
        "payload": {"proofDigest": "digest-1"},
    }

    TradeLedger.append_event(event)
    TradeLedger.append_event({**event, "createdAt": "2026-06-07T00:01:00+00:00"})
    summary = TradeLedger.get_ledger_summary(limit=5)

    assert summary["dailyCompliance"]["tradeCount"] == 1


def test_ledger_confirmed_trade_count_dedupes_same_tx_different_digest(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    tx_hash = "0x" + "2" * 64
    event = {
        "eventType": "trade_receipt_confirmed",
        "tradeIntentId": "intent-1",
        "txHash": tx_hash,
        "createdAt": "2026-06-07T00:00:00+00:00",
        "payload": {"proofDigest": "digest-1"},
    }

    TradeLedger.append_event(event)
    TradeLedger.append_event({
        **event,
        "tradeIntentId": "intent-2",
        "payload": {"proofDigest": "digest-2"},
    })
    summary = TradeLedger.get_ledger_summary(limit=5)

    assert summary["dailyCompliance"]["tradeCount"] == 1


def test_ledger_submitted_trade_count_dedupes_submission_and_receipt(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    tx_hash = "0x" + "5" * 64

    TradeLedger.append_event({
        "eventType": "trade_executed",
        "tradeIntentId": "intent-1",
        "txHash": tx_hash,
        "createdAt": "2026-06-07T00:00:00+00:00",
        "payload": {},
    })
    TradeLedger.append_event({
        "eventType": "trade_receipt_confirmed",
        "tradeIntentId": "intent-1",
        "txHash": tx_hash,
        "createdAt": "2026-06-07T00:01:00+00:00",
        "payload": {"proof": {"valid": True}},
    })
    summary = TradeLedger.get_ledger_summary(limit=5)

    assert summary["dailyCompliance"]["submittedTradeCount"] == 1
    assert summary["dailyCompliance"]["tradeCount"] == 1


def test_ledger_reports_registration_period_pnl(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    registration_tx = "0x" + "3" * 64

    TradeLedger.append_event({
        "eventType": "pnl_updated",
        "createdAt": "2026-06-06T23:50:00+00:00",
        "payload": {"totalReturnPct": 2, "maxDrawdownPct": 1},
    })
    TradeLedger.append_event({
        "eventType": "competition_registered",
        "txHash": registration_tx,
        "createdAt": "2026-06-07T00:00:00+00:00",
        "payload": {"txHash": registration_tx},
    })
    TradeLedger.append_event({
        "eventType": "pnl_updated",
        "createdAt": "2026-06-08T00:00:00+00:00",
        "payload": {"totalReturnPct": 5, "maxDrawdownPct": 3},
    })
    TradeLedger.append_event({
        "eventType": "pnl_updated",
        "createdAt": "2026-06-09T00:00:00+00:00",
        "payload": {"totalReturnPct": 7.5, "maxDrawdownPct": 2},
    })

    pnl = TradeLedger.get_ledger_summary(limit=5)["pnl"]
    period = pnl["registrationPeriod"]

    assert pnl["totalReturnPct"] == 7.5
    assert period["source"] == "competition_registered"
    assert period["registrationTxHash"] == registration_tx
    assert period["registrationStartAt"] == "2026-06-07T00:00:00+00:00"
    assert period["totalReturnPct"] == 5.5
    assert period["maxDrawdownPct"] == 3
    assert int(period["days"]) >= 1


def test_ledger_pnl_uses_confirmed_trade_history_over_legacy_snapshot(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()

    TradeLedger.append_event({
        "eventType": "pnl_updated",
        "createdAt": "2026-06-07T00:00:00+00:00",
        "payload": {"totalReturnPct": -99, "maxDrawdownPct": 99},
    })
    for tx_digit, timestamp, pnl_usd in (
        ("6", "2026-06-07T00:01:00+00:00", 5),
        ("7", "2026-06-07T00:02:00+00:00", -2),
    ):
        TradeLedger.append_event({
            "eventType": "trade_receipt_confirmed",
            "tradeIntentId": f"intent-{tx_digit}",
            "txHash": "0x" + tx_digit * 64,
            "createdAt": timestamp,
            "payload": {
                "amountUsd": 100,
                "pnl": {"realizedPnlUsd": pnl_usd, "basisUsd": 50},
                "proof": {"valid": True},
            },
        })

    pnl = TradeLedger.get_ledger_summary(limit=5)["pnl"]

    assert pnl["source"] == "trade_history"
    assert pnl["status"] == "ok"
    assert pnl["trackedTrades"] == 2
    assert pnl["totalPnlUsd"] == 3
    assert pnl["notionalUsd"] == 100
    assert pnl["totalReturnPct"] == 3
    assert pnl["maxDrawdownPct"] == 2


def test_ledger_registration_period_pnl_uses_confirmed_trade_history(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    registration_tx = "0x" + "8" * 64

    TradeLedger.append_event({
        "eventType": "trade_receipt_confirmed",
        "tradeIntentId": "intent-before",
        "txHash": "0x" + "9" * 64,
        "createdAt": "2026-06-06T23:50:00+00:00",
        "payload": {"pnl": {"realizedPnlUsd": 10, "basisUsd": 100}},
    })
    TradeLedger.append_event({
        "eventType": "competition_registered",
        "txHash": registration_tx,
        "createdAt": "2026-06-07T00:00:00+00:00",
        "payload": {"txHash": registration_tx},
    })
    TradeLedger.append_event({
        "eventType": "trade_receipt_confirmed",
        "tradeIntentId": "intent-after",
        "txHash": "0x" + "a" * 64,
        "createdAt": "2026-06-07T00:10:00+00:00",
        "payload": {"pnl": {"realizedPnlUsd": -5, "basisUsd": 100}},
    })

    period = TradeLedger.get_ledger_summary(limit=5)["pnl"]["registrationPeriod"]

    assert period["source"] == "competition_registered"
    assert period["registrationTxHash"] == registration_tx
    assert period["trackedTrades"] == 1
    assert period["totalPnlUsd"] == -5
    assert period["totalReturnPct"] == -5
    assert period["maxDrawdownPct"] == 5


def test_ledger_pnl_marks_confirmed_history_missing_pnl(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()

    TradeLedger.append_event({
        "eventType": "trade_receipt_confirmed",
        "tradeIntentId": "intent-missing",
        "txHash": "0x" + "b" * 64,
        "createdAt": "2026-06-07T00:00:00+00:00",
        "payload": {"amountUsd": 100, "proof": {"valid": True}},
    })

    pnl = TradeLedger.get_ledger_summary(limit=5)["pnl"]

    assert pnl["source"] == "trade_history_missing_pnl"
    assert pnl["available"] is False
    assert pnl["status"] == "missing_trade_pnl"
    assert pnl["confirmedTrades"] == 1
    assert pnl["missingPnlTrades"] == 1


def test_ledger_pnl_marks_realized_pnl_without_basis_missing(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()

    TradeLedger.append_event({
        "eventType": "trade_receipt_confirmed",
        "tradeIntentId": "intent-no-basis",
        "txHash": "0x" + "c" * 64,
        "createdAt": "2026-06-07T00:00:00+00:00",
        "payload": {"pnl": {"realizedPnlUsd": 5}, "proof": {"valid": True}},
    })

    pnl = TradeLedger.get_ledger_summary(limit=5)["pnl"]

    assert pnl["status"] == "missing_trade_pnl"
    assert pnl["trackedTrades"] == 0
    assert pnl["missingPnlTrades"] == 1


def test_ledger_pnl_marks_mixed_history_partial(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()

    TradeLedger.append_event({
        "eventType": "trade_receipt_confirmed",
        "tradeIntentId": "intent-tracked",
        "txHash": "0x" + "d" * 64,
        "createdAt": "2026-06-07T00:00:00+00:00",
        "payload": {"pnl": {"realizedPnlUsd": 3, "basisUsd": 30}},
    })
    TradeLedger.append_event({
        "eventType": "trade_receipt_confirmed",
        "tradeIntentId": "intent-missing",
        "txHash": "0x" + "e" * 64,
        "createdAt": "2026-06-07T00:01:00+00:00",
        "payload": {"amountUsd": 30},
    })

    pnl = TradeLedger.get_ledger_summary(limit=5)["pnl"]

    assert pnl["status"] == "partial"
    assert pnl["trackedTrades"] == 1
    assert pnl["missingPnlTrades"] == 1


def test_registration_period_keeps_missing_trade_pnl_visible(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    registration_tx = "0x" + "f" * 64

    TradeLedger.append_event({
        "eventType": "competition_registered",
        "txHash": registration_tx,
        "createdAt": "2026-06-07T00:00:00+00:00",
        "payload": {"txHash": registration_tx},
    })
    TradeLedger.append_event({
        "eventType": "trade_receipt_confirmed",
        "tradeIntentId": "intent-missing",
        "txHash": "0x" + "1" * 64,
        "createdAt": "2026-06-07T00:01:00+00:00",
        "payload": {"amountUsd": 30},
    })

    period = TradeLedger.get_ledger_summary(limit=5)["pnl"]["registrationPeriod"]

    assert period["source"] == "competition_registered"
    assert period["status"] == "missing_trade_pnl"
    assert period["missingPnlTrades"] == 1


def test_ledger_reports_empty_registration_period_without_proof() -> None:
    period = TradeLedger.latest_pnl([])["registrationPeriod"]

    assert period["source"] == "no_registration"
    assert period["registrationStartAt"] is None
    assert period["totalReturnPct"] == 0


def test_risk_check_can_skip_ledger_record(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()

    result = RiskCheckService.run_risk_check("CAKE", "buy", 1, record_ledger=False)
    summary = TradeLedger.get_ledger_summary(limit=5)

    assert result["tradeIntentId"].startswith("intent-")
    assert "ledgerEvent" not in result
    assert summary["events"] == []


def test_mcp_tools_registry_lists_tools() -> None:
    assert any(tool["name"] == "bnb_run_autonomous_cycle" for tool in McpToolRegistry.list_tools())


def test_dynamic_adapter_registry_resolves_fastapi_adapter() -> None:
    adapter = DynamicAgentAdapterRegistry.resolve("fastapi-bnb-agent")

    assert adapter.adapter_id == "fastapi-bnb-agent"
    assert any(tool["name"] == "bnb_execute_trade" for tool in adapter.list_tools({"bnb_execute_trade"}))


def test_mcp_tool_call_can_route_through_dynamic_adapter() -> None:
    class TestAdapter:
        adapter_id = "test-dynamic-adapter"

        def list_tools(self, allowed_tools: set[str]) -> list[dict[str, Any]]:
            return [{"name": name, "description": "test", "inputSchema": {}} for name in allowed_tools]

        async def call_tool(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
            return {"network": "bsc", "adapter": self.adapter_id, "toolName": name, "args": args}

        async def run_autonomous_cycle(self, args: dict[str, Any]) -> dict[str, Any]:
            return {"network": "bsc", "adapter": self.adapter_id, "args": args}

    DynamicAgentAdapterRegistry.register(TestAdapter())
    result = asyncio.run(McpToolRegistry.call_tool("bnb_emergency_pause", {"_adapter": "test-dynamic-adapter"}))

    assert result.model_dump()["adapter"] == "test-dynamic-adapter"
    assert result.model_dump()["toolName"] == "bnb_emergency_pause"
