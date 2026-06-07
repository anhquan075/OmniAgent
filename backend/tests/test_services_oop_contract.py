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
