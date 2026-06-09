from fastapi.testclient import TestClient
from datetime import datetime, timezone
import asyncio
import httpx
import json

from app.core.settings import get_settings
from app.main import app
from app.services.agent.heikin_ashi_signal import HeikinAshiSignalService
from app.services.agent.strategy_decision import TradingStrategyDecisionService
from app.services.cmc.signal_config import CmcSignalConfigService
from app.services.shared.ledger import TradeLedger
from app.services.trading.execution import TradeExecutionService


def call_mcp(client: TestClient, csrf_token: str, name: str, arguments: dict[str, object]) -> dict[str, object]:
    response = client.post(
        "/api/mcp",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "jsonrpc": "2.0",
            "id": name,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        },
    )
    assert response.status_code == 200
    return response.json()


def parsed_tool_result(response_body: dict[str, object]) -> dict[str, object]:
    import json

    text = response_body["result"]["content"][0]["text"]  # type: ignore[index]
    return json.loads(text)


def downtrend_chart() -> list[dict[str, object]]:
    return [
        {"time": "2026-06-07T09:10:00+00:00", "open": 610, "high": 611, "low": 604, "price": 605},
        {"time": "2026-06-07T09:15:00+00:00", "open": 605, "high": 606, "low": 598, "price": 599},
        {"time": "2026-06-07T09:20:00+00:00", "open": 599, "high": 600, "low": 592, "price": 593},
        {"time": "2026-06-07T09:25:00+00:00", "open": 593, "high": 594, "low": 586, "price": 587},
        {"time": "2026-06-07T09:30:00+00:00", "open": 587, "high": 588, "low": 580, "price": 581},
    ]


def seed_competition_registration(ledger_path) -> None:
    ledger_path.write_text(json.dumps({
        "eventType": "competition_registered",
        "txHash": "0x" + "c" * 64,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
            "competitionContractAddress": "0x212c61b9b72c95d95bf29cf032f5e5635629aed5",
            "chainId": 56,
        },
    }) + "\n", encoding="utf-8")


def test_health() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["network"] == "bsc"
    api_response = client.get("/api/health")
    assert api_response.status_code == 200
    assert api_response.json() == response.json()


def test_mcp_session_and_cockpit_snapshot() -> None:
    client = TestClient(app)
    session = client.get("/api/session")
    assert session.status_code == 200
    csrf_token = session.json()["csrfToken"]

    tools = client.post(
        "/api/mcp",
        headers={"X-CSRF-Token": csrf_token},
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
    )
    assert tools.status_code == 200
    tool_names = [tool["name"] for tool in tools.json()["result"]["tools"]]
    assert "bnb_agent_cockpit_snapshot" in tool_names

    snapshot = client.post(
        "/api/mcp",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "bnb_agent_cockpit_snapshot", "arguments": {"limit": 3}},
        },
    )
    assert snapshot.status_code == 200
    text = snapshot.json()["result"]["content"][0]["text"]
    assert "\"wallet\"" in text
    assert "\"toolsUsed\"" in text
    assert "\"identityProof\"" in text
    assert "\"twakStatus\"" in text
    assert "\"_meta\"" in text


def test_dashboard_snapshot_is_session_scoped(monkeypatch) -> None:
    async def fake_cockpit(limit: int = 10) -> dict[str, object]:
        return {
            "network": "bsc",
            "wallet": {"walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"},
            "toolsUsed": ["bnb_agent_cockpit_snapshot"],
            "limit": limit,
        }

    async def fake_preflight(args: dict[str, object]) -> dict[str, object]:
        return {"readyForLiveTrade": True, "args": args}

    async def fake_proof_bundle(args: dict[str, object]) -> dict[str, object]:
        return {"status": "ready_for_live_trade", "args": args}

    def fake_latest_cycle(_: object) -> dict[str, object]:
        return {"strategyDecision": {"source": "deterministic", "decision": {"action": "buy", "confidence": 0.7}}}

    monkeypatch.setattr("app.api.routes.dashboard.AgentCockpitService.get_cockpit_snapshot", fake_cockpit)
    monkeypatch.setattr("app.api.routes.dashboard.LivePreflightService.get_live_preflight", fake_preflight)
    monkeypatch.setattr("app.api.routes.dashboard.ProofBundleService.get_live_proof_bundle", fake_proof_bundle)
    monkeypatch.setattr("app.api.routes.dashboard.AutonomousLoopService.get_latest_cycle", fake_latest_cycle)
    client = TestClient(app)

    assert client.get("/api/dashboard/snapshot").status_code == 401
    assert client.get("/api/session").status_code == 200
    response = client.get("/api/dashboard/snapshot?limit=3")

    assert response.status_code == 200
    body = response.json()
    assert body["network"] == "bsc"
    assert body["limit"] == 3
    assert body["cycle"]["strategyDecision"]["decision"]["action"] == "buy"
    assert body["livePreflight"]["readyForLiveTrade"] is True
    assert body["liveProofBundle"]["status"] == "ready_for_live_trade"
    assert body["backendHealth"]["autonomousLoopEnabled"] == get_settings().bnb_autonomous_loop_enabled


def test_dashboard_cmc_daily_market_overview_requires_session_and_records(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    async def fake_run(args: dict[str, object]) -> dict[str, object]:
        calls.append(args)
        return {
            "ready": True,
            "skillName": "daily_market_overview",
            "uniqueName": "daily_market_overview",
            "status": "partial",
            "confidence": "medium",
        }

    monkeypatch.setattr("app.api.routes.dashboard.CmcDailyMarketOverviewService.run", fake_run)
    client = TestClient(app)

    assert client.post("/api/dashboard/cmc-daily-market-overview").status_code == 401
    csrf_token = client.get("/api/session").json()["csrfToken"]
    response = client.post(
        "/api/dashboard/cmc-daily-market-overview",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    assert response.json()["uniqueName"] == "daily_market_overview"
    assert calls == [{"preview": True, "recordLedger": True}]


def test_competition_registration_dry_run_returns_twak_instructions() -> None:
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_competition_register",
        {
            "walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
            "metadataUri": "ipfs://omniagent",
            "submit": False,
        },
    ))
    assert result["submitted"] is False
    assert result["manualCommand"] == "twak compete register"
    assert result["competitionContractAddress"] == "0x212c61b9b72c95d95bf29cf032f5e5635629aed5"


def test_competition_status_reports_rest_connection_failure(monkeypatch) -> None:
    async def fake_call_rest_action(*args: object, **kwargs: object) -> dict[str, object]:
        raise httpx.ConnectError("twak offline")

    monkeypatch.setattr("app.services.twak.rest.TrustWalletRestClient.call_rest_action", fake_call_rest_action)
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"baseUrl": "http://twak.local"}))
    get_settings.cache_clear()

    from app.services.agent.cockpit import AgentCockpitService

    result = asyncio.run(AgentCockpitService.get_competition_status())
    assert result == {"ready": False, "registered": False, "reason": "twak offline"}
    get_settings.cache_clear()


def test_competition_status_reports_rest_payload_failure(monkeypatch) -> None:
    async def fake_call_rest_action(*args: object, **kwargs: object) -> dict[str, object]:
        raise ValueError("bad twak payload")

    monkeypatch.setattr("app.services.twak.rest.TrustWalletRestClient.call_rest_action", fake_call_rest_action)
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"baseUrl": "http://twak.local"}))
    get_settings.cache_clear()

    from app.services.agent.cockpit import AgentCockpitService

    result = asyncio.run(AgentCockpitService.get_competition_status())
    assert result == {"ready": False, "registered": False, "reason": "bad twak payload"}
    get_settings.cache_clear()


def test_competition_status_reports_cli_failure(monkeypatch) -> None:
    def fake_cli_status(*args: object, **kwargs: object) -> dict[str, object]:
        raise RuntimeError("twak cli offline")

    monkeypatch.setattr("app.services.twak.cli.TrustWalletCliClient.get_cli_competition_status", fake_cli_status)
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "cli")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"command": "twak"}))
    get_settings.cache_clear()

    from app.services.agent.cockpit import AgentCockpitService

    result = asyncio.run(AgentCockpitService.get_competition_status())
    assert result == {"ready": False, "registered": False, "reason": "twak cli offline"}
    get_settings.cache_clear()


def test_competition_register_already_registered_reports_missing_ledger_proof(monkeypatch, tmp_path) -> None:
    async def fake_call_rest_action(*args: object, **kwargs: object) -> dict[str, object]:
        return {"registered": True, "participant": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"}

    monkeypatch.setattr("app.services.twak.rest.TrustWalletRestClient.call_rest_action", fake_call_rest_action)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"baseUrl": "http://twak.local"}))
    monkeypatch.setenv("BNB_COMPETITION_REGISTRATION_ENABLED", "true")
    get_settings.cache_clear()

    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_competition_register",
        {"metadataUri": "ipfs://omniagent", "submit": True},
    ))

    assert result["status"] == "already_registered_external"
    assert result["ledgerProofRequired"] is True
    assert result["ledgerProofStored"] is False
    assert "record-bnb-competition-registration.py" in result["reason"]
    assert not (tmp_path / "ledger.jsonl").exists()
    get_settings.cache_clear()


def test_competition_readiness_exposes_wallet_registration_proof(monkeypatch, tmp_path) -> None:
    from app.services.agent.cockpit import AgentCockpitService

    ledger_path = tmp_path / "ledger.jsonl"
    seed_competition_registration(ledger_path)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()

    result = AgentCockpitService.build_competition_readiness(
        {"walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"},
        TradeLedger.get_ledger_summary(limit=10),
        {"status": "ready"},
        {"registered": True},
    )

    assert result["registered"] is True
    assert result["registrationTxHash"] == "0x" + "c" * 64
    assert result["registrationProof"] == {
        "source": "trade-ledger",
        "eventType": "competition_registered",
        "txHash": "0x" + "c" * 64,
        "explorerUrl": "https://bscscan.com/tx/" + "0x" + "c" * 64,
        "walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
        "competitionContractAddress": "0x212c61b9b72c95d95bf29cf032f5e5635629aed5",
        "chainId": 56,
        "createdAt": result["registrationProof"]["createdAt"],
        "recordedAt": None,
        "receiptProof": None,
    }
    get_settings.cache_clear()


def test_agent_sdk_status_reports_uv_installed_package() -> None:
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_agent_sdk_status",
        {},
    ))
    assert result["package"] == "bnbagent"
    assert result["installed"] is True
    assert result["version"]
    assert result["registryAddress"] == "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"


def test_live_preflight_blocks_when_cmc_is_missing(monkeypatch, tmp_path) -> None:
    async def fake_twak_status() -> dict[str, object]:
        return {"ready": True}

    async def fake_competition_status() -> dict[str, object]:
        return {"registered": True}

    async def fake_capital(_: str) -> dict[str, object]:
        return {
            "ready": True,
            "balances": [{"symbol": "BNB", "spendableRaw": "1000000000000000000"}],
        }

    async def fake_cmc(_: list[str]) -> dict[str, object]:
        return {
            "configured": False,
            "symbols": {"BNB": {"symbol": "BNB", "priceUsd": None}},
            "reason": "CMC key missing",
        }

    async def fake_cmc_agent_hub() -> dict[str, object]:
        return {"ready": True}

    async def fake_cycle(_: dict[str, object]) -> dict[str, object]:
        return {}

    monkeypatch.setattr(
        "app.services.wallet.agent_wallet.AgentWalletService.get_wallet_data",
        lambda: {"walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25", "tradingEnabled": False, "allowAgentRun": False},
    )
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.get_trust_wallet_status", fake_twak_status)
    monkeypatch.setattr("app.services.agent.status.BnbAgentStatusService.get_agent_sdk_status_dict", lambda: {"ready": True})
    monkeypatch.setattr("app.services.agent.cockpit.AgentCockpitService.get_competition_status", fake_competition_status)
    monkeypatch.setattr("app.services.wallet.balances.CapitalReadinessService.get_capital_readiness", fake_capital)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_cmc)
    monkeypatch.setattr("app.services.cmc.agent_hub.CmcAgentHubClient.get_cmc_agent_hub_status", fake_cmc_agent_hub)
    monkeypatch.setattr("app.services.agent.autonomous_cycle.AutonomousTradingAgent.run_autonomous_cycle", fake_cycle)
    ledger_path = tmp_path / "ledger.jsonl"
    seed_competition_registration(ledger_path)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(client, csrf_token, "bnb_live_preflight", {}))
    assert result["readyToEnableLive"] is False
    assert result["readyForLiveTrade"] is False
    assert {item["name"] for item in result["blockers"]} == {
        "cmc",
        "cmc_agent_hub_signal",
        "funded_route",
        "live_flags",
    }
    assert "CMC Agent Hub" in result["cmcAgentHubSignal"]["reason"]


def test_live_preflight_blocks_when_configured_cmc_agent_hub_signal_fails(monkeypatch, tmp_path) -> None:
    async def fake_twak_status() -> dict[str, object]:
        return {"ready": True}

    async def fake_competition_status() -> dict[str, object]:
        return {"registered": True}

    async def fake_capital(_: str) -> dict[str, object]:
        return {
            "ready": True,
            "balances": [{"symbol": "BNB", "spendableRaw": "1000000000000000000"}],
        }

    async def fake_cmc(_: list[str]) -> dict[str, object]:
        return {
            "configured": True,
            "reachable": True,
            "symbols": {"BNB": {"symbol": "BNB", "priceUsd": 600}},
        }

    async def fake_cmc_agent_hub() -> dict[str, object]:
        return {"ready": True}

    async def fake_cmc_signal(args: dict[str, object]) -> dict[str, object]:
        assert args == {"toolName": "crypto.signal.test", "arguments": {"symbol": "BNB"}}
        return {"ready": False, "reason": "tool not found"}

    async def fake_recommendation(limit: int = 1) -> dict[str, object]:
        assert limit == 1
        return {"ready": False, "reason": "manual tool required"}

    async def fake_cycle(_: dict[str, object]) -> dict[str, object]:
        return {
            "quote": {"quoteSource": "router"},
            "execution": {"simulation": {"transaction": {"data": "0x1234"}}},
        }

    monkeypatch.setattr(
        "app.services.wallet.agent_wallet.AgentWalletService.get_wallet_data",
        lambda: {"walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25", "tradingEnabled": True, "allowAgentRun": True},
    )
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.get_trust_wallet_status", fake_twak_status)
    monkeypatch.setattr("app.services.agent.status.BnbAgentStatusService.get_agent_sdk_status_dict", lambda: {"ready": True})
    monkeypatch.setattr("app.services.agent.cockpit.AgentCockpitService.get_competition_status", fake_competition_status)
    monkeypatch.setattr("app.services.wallet.balances.CapitalReadinessService.get_capital_readiness", fake_capital)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_cmc)
    monkeypatch.setattr("app.services.cmc.agent_hub.CmcAgentHubClient.get_cmc_agent_hub_status", fake_cmc_agent_hub)
    monkeypatch.setattr("app.services.cmc.agent_hub_tools.CmcAgentHubToolClient.call_cmc_agent_hub_tool", fake_cmc_signal)
    monkeypatch.setattr("app.services.cmc.agent_hub_recommendations.CmcAgentHubRecommendationService.recommend_cmc_agent_hub_signal_tools", fake_recommendation)
    monkeypatch.setattr("app.services.agent.autonomous_cycle.AutonomousTradingAgent.run_autonomous_cycle", fake_cycle)
    monkeypatch.setenv("CMC_AGENT_HUB_SIGNAL_TOOL", "crypto.signal.test")
    monkeypatch.setenv("CMC_AGENT_HUB_SIGNAL_ARGS", '{"symbol":"BNB"}')
    ledger_path = tmp_path / "ledger.jsonl"
    seed_competition_registration(ledger_path)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(client, csrf_token, "bnb_live_preflight", {}))
    assert result["readyToEnableLive"] is False
    assert result["readyForLiveTrade"] is False
    assert {item["name"] for item in result["blockers"]} == {"cmc_agent_hub_signal"}
    assert result["cmcAgentHubSignal"]["reason"] == "tool not found"
    get_settings.cache_clear()


def test_live_preflight_auto_discovers_cmc_agent_hub_signal_tool(monkeypatch, tmp_path) -> None:
    async def fake_twak_status() -> dict[str, object]:
        return {"ready": True}

    async def fake_competition_status() -> dict[str, object]:
        return {"registered": True}

    async def fake_capital(_: str) -> dict[str, object]:
        return {"ready": True, "balances": [{"symbol": "BNB", "spendableRaw": "1000000000000000000"}]}

    async def fake_cmc(_: list[str]) -> dict[str, object]:
        return {"configured": True, "reachable": True, "symbols": {"BNB": {"symbol": "BNB", "priceUsd": 600}}}

    async def fake_cmc_agent_hub() -> dict[str, object]:
        return {"ready": True}

    async def fake_recommendation(limit: int = 1) -> dict[str, object]:
        return {"ready": True, "recommendedToolName": "crypto.signal.auto", "recommendedArgs": {"symbol": "BNB"}}

    async def fake_cmc_signal(args: dict[str, object]) -> dict[str, object]:
        assert args == {"toolName": "crypto.signal.auto", "arguments": {"symbol": "BNB"}}
        return {
            "ready": True,
            "toolName": "crypto.signal.auto",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def fake_cycle(_: dict[str, object]) -> dict[str, object]:
        return {"quote": {"quoteSource": "router"}, "execution": {"simulation": {"transaction": {"data": "0x1234"}}}}

    monkeypatch.setattr(
        "app.services.wallet.agent_wallet.AgentWalletService.get_wallet_data",
        lambda: {"walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25", "tradingEnabled": True, "allowAgentRun": True},
    )
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.get_trust_wallet_status", fake_twak_status)
    monkeypatch.setattr("app.services.agent.status.BnbAgentStatusService.get_agent_sdk_status_dict", lambda: {"ready": True})
    monkeypatch.setattr("app.services.agent.cockpit.AgentCockpitService.get_competition_status", fake_competition_status)
    monkeypatch.setattr("app.services.wallet.balances.CapitalReadinessService.get_capital_readiness", fake_capital)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_cmc)
    monkeypatch.setattr("app.services.cmc.agent_hub.CmcAgentHubClient.get_cmc_agent_hub_status", fake_cmc_agent_hub)
    monkeypatch.setattr("app.services.cmc.agent_hub_recommendations.CmcAgentHubRecommendationService.recommend_cmc_agent_hub_signal_tools", fake_recommendation)
    monkeypatch.setattr("app.services.cmc.agent_hub_tools.CmcAgentHubToolClient.call_cmc_agent_hub_tool", fake_cmc_signal)
    monkeypatch.setattr("app.services.agent.autonomous_cycle.AutonomousTradingAgent.run_autonomous_cycle", fake_cycle)
    ledger_path = tmp_path / "ledger.jsonl"
    seed_competition_registration(ledger_path)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(client, csrf_token, "bnb_live_preflight", {}))
    assert result["readyForLiveTrade"] is True
    assert result["cmcAgentHubSignal"]["toolName"] == "crypto.signal.auto"
    assert result["cmcAgentHubSignal"]["serverVerified"] is True
    assert result["cmcAgentHubSignal"]["resolution"] == "auto_discovered"
    get_settings.cache_clear()


def test_live_preflight_accepts_cmc_agent_hub_signal_args(monkeypatch, tmp_path) -> None:
    async def fake_twak_status() -> dict[str, object]:
        return {"ready": True}

    async def fake_competition_status() -> dict[str, object]:
        return {"registered": True}

    async def fake_capital(_: str) -> dict[str, object]:
        return {
            "ready": True,
            "balances": [{"symbol": "BNB", "spendableRaw": "1000000000000000000"}],
        }

    async def fake_cmc(_: list[str]) -> dict[str, object]:
        return {
            "configured": True,
            "reachable": True,
            "symbols": {"BNB": {"symbol": "BNB", "priceUsd": 600}},
        }

    async def fake_cmc_agent_hub() -> dict[str, object]:
        return {"ready": True}

    async def fake_cmc_signal(args: dict[str, object]) -> dict[str, object]:
        assert args == {"toolName": "crypto.signal.test", "arguments": {"symbol": "BNB"}}
        return {
            "ready": True,
            "toolName": "crypto.signal.test",
            "parsedContent": [{"signal": "buy"}],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def fake_cycle(_: dict[str, object]) -> dict[str, object]:
        return {
            "quote": {"quoteSource": "router"},
            "execution": {"simulation": {"transaction": {"data": "0x1234"}}},
        }

    monkeypatch.setattr(
        "app.services.wallet.agent_wallet.AgentWalletService.get_wallet_data",
        lambda: {"walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25", "tradingEnabled": True, "allowAgentRun": True},
    )
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.get_trust_wallet_status", fake_twak_status)
    monkeypatch.setattr("app.services.agent.status.BnbAgentStatusService.get_agent_sdk_status_dict", lambda: {"ready": True})
    monkeypatch.setattr("app.services.agent.cockpit.AgentCockpitService.get_competition_status", fake_competition_status)
    monkeypatch.setattr("app.services.wallet.balances.CapitalReadinessService.get_capital_readiness", fake_capital)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_cmc)
    monkeypatch.setattr("app.services.cmc.agent_hub.CmcAgentHubClient.get_cmc_agent_hub_status", fake_cmc_agent_hub)
    monkeypatch.setattr("app.services.cmc.agent_hub_tools.CmcAgentHubToolClient.call_cmc_agent_hub_tool", fake_cmc_signal)
    monkeypatch.setattr("app.services.agent.autonomous_cycle.AutonomousTradingAgent.run_autonomous_cycle", fake_cycle)
    ledger_path = tmp_path / "ledger.jsonl"
    seed_competition_registration(ledger_path)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_live_preflight",
        {"cmcAgentHubTool": "crypto.signal.test", "cmcAgentHubArgs": {"symbol": "BNB"}},
    ))
    assert result["readyToEnableLive"] is True
    assert result["readyForLiveTrade"] is True
    assert result["blockers"] == []
    assert result["cmcAgentHubSignal"]["parsedContent"] == [{"signal": "buy"}]
    get_settings.cache_clear()


def test_live_preflight_requires_stored_competition_proof_even_when_twak_reports_registered(monkeypatch, tmp_path) -> None:
    async def fake_twak_status() -> dict[str, object]:
        return {"ready": True}

    async def fake_competition_status() -> dict[str, object]:
        return {"registered": True, "participant": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"}

    async def fake_capital(_: str) -> dict[str, object]:
        return {"ready": True, "balances": [{"symbol": "BNB", "spendableRaw": "1000000000000000000"}]}

    async def fake_cmc(_: list[str]) -> dict[str, object]:
        return {"configured": True, "reachable": True, "symbols": {"BNB": {"symbol": "BNB", "priceUsd": 600}}}

    async def fake_cmc_agent_hub() -> dict[str, object]:
        return {"ready": True}

    async def fake_recommendation(limit: int = 1) -> dict[str, object]:
        return {"ready": True, "recommendedToolName": "crypto.signal.auto", "recommendedArgs": {"symbol": "BNB"}}

    async def fake_cmc_signal(args: dict[str, object]) -> dict[str, object]:
        return {"ready": True, "toolName": "crypto.signal.auto", "timestamp": datetime.now(timezone.utc).isoformat()}

    async def fake_cycle(_: dict[str, object]) -> dict[str, object]:
        return {"quote": {"quoteSource": "router"}, "execution": {"simulation": {"transaction": {"data": "0x1234"}}}}

    monkeypatch.setattr(
        "app.services.wallet.agent_wallet.AgentWalletService.get_wallet_data",
        lambda: {"walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25", "tradingEnabled": True, "allowAgentRun": True},
    )
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.get_trust_wallet_status", fake_twak_status)
    monkeypatch.setattr("app.services.agent.status.BnbAgentStatusService.get_agent_sdk_status_dict", lambda: {"ready": True})
    monkeypatch.setattr("app.services.agent.cockpit.AgentCockpitService.get_competition_status", fake_competition_status)
    monkeypatch.setattr("app.services.wallet.balances.CapitalReadinessService.get_capital_readiness", fake_capital)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_cmc)
    monkeypatch.setattr("app.services.cmc.agent_hub.CmcAgentHubClient.get_cmc_agent_hub_status", fake_cmc_agent_hub)
    monkeypatch.setattr("app.services.cmc.agent_hub_recommendations.CmcAgentHubRecommendationService.recommend_cmc_agent_hub_signal_tools", fake_recommendation)
    monkeypatch.setattr("app.services.cmc.agent_hub_tools.CmcAgentHubToolClient.call_cmc_agent_hub_tool", fake_cmc_signal)
    monkeypatch.setattr("app.services.agent.autonomous_cycle.AutonomousTradingAgent.run_autonomous_cycle", fake_cycle)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()

    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(client, csrf_token, "bnb_live_preflight", {}))

    assert result["readyForLiveTrade"] is False
    assert any(item["name"] == "competition" for item in result["blockers"])
    get_settings.cache_clear()


def test_cmc_agent_hub_status_requires_key(monkeypatch) -> None:
    for key in (
        "CMC_AGENT_HUB_API_KEY",
        "CMC_MCP_API_KEY",
        "CMC_PRO_API_KEY",
        "COINMARKETCAP_API_KEY",
        "X_CMC_PRO_API_KEY",
    ):
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(client, csrf_token, "cmc_agent_hub_status", {}))
    assert result["source"] == "coinmarketcap-agent-hub-mcp"
    assert result["configured"] is False
    assert result["ready"] is False
    assert result["endpoint"] == "https://mcp.coinmarketcap.com/mcp"
    assert "CMC_MCP_API_KEY" in result["reason"]
    get_settings.cache_clear()


def test_cmc_agent_hub_status_sends_initialized_notification(monkeypatch) -> None:
    from app.services.cmc import agent_hub as cmc_agent_hub

    calls: list[tuple[str, str | None]] = []

    async def fake_request(
        endpoint: str,
        api_key: str,
        method: str,
        params: dict[str, object],
        session_id: str | None = None,
    ) -> dict[str, object]:
        assert endpoint == "https://mcp.coinmarketcap.com/mcp"
        assert api_key == "cmc-test-key"
        calls.append((method, session_id))
        if method == "initialize":
            return {"sessionId": "cmc-session"}
        return {
            "tools": [
                {
                    "name": "crypto.price.latest",
                    "description": "Latest crypto price data",
                    "inputSchema": {"properties": {"symbol": {"type": "string"}}},
                }
            ]
        }

    async def fake_notification(
        endpoint: str,
        api_key: str,
        method: str,
        params: dict[str, object],
        session_id: str | None = None,
    ) -> None:
        assert endpoint == "https://mcp.coinmarketcap.com/mcp"
        assert api_key == "cmc-test-key"
        assert params == {}
        calls.append((method, session_id))

    monkeypatch.setenv("CMC_MCP_API_KEY", "cmc-test-key")
    get_settings.cache_clear()
    monkeypatch.setattr(cmc_agent_hub.CmcAgentHubClient, "mcp_request", fake_request)
    monkeypatch.setattr(cmc_agent_hub.CmcAgentHubClient, "mcp_notification", fake_notification)

    result = asyncio.run(cmc_agent_hub.CmcAgentHubClient.get_cmc_agent_hub_status())

    assert result["ready"] is True
    assert result["tools"] == ["crypto.price.latest"]
    assert result["toolSummaries"] == [
        {
            "name": "crypto.price.latest",
            "description": "Latest crypto price data",
            "inputSchema": {"properties": {"symbol": {"type": "string"}}},
        }
    ]
    assert calls == [
        ("initialize", None),
        ("notifications/initialized", "cmc-session"),
        ("tools/list", "cmc-session"),
    ]
    get_settings.cache_clear()


def test_cmc_agent_hub_recommends_signal_tools(monkeypatch) -> None:
    from app.services.cmc import agent_hub_recommendations as cmc_agent_hub_recommendations

    async def fake_status() -> dict[str, object]:
        return {
            "configured": True,
            "reachable": True,
            "ready": True,
            "endpoint": "https://mcp.coinmarketcap.com/mcp",
            "toolCount": 3,
            "toolSummaries": [
                {"name": "crypto.price.latest", "description": "Latest price", "inputSchema": {"properties": {"symbol": {}}}},
                {"name": "market.sentiment.signal", "description": "Fear and Greed strategy signal", "inputSchema": {"properties": {"symbols": {}}}},
                {"name": "news.search", "description": "Search market news", "inputSchema": {"properties": {"query": {}}}},
            ],
        }

    monkeypatch.setattr(cmc_agent_hub_recommendations.CmcAgentHubClient, "get_cmc_agent_hub_status", fake_status)
    result = asyncio.run(cmc_agent_hub_recommendations.CmcAgentHubRecommendationService.recommend_cmc_agent_hub_signal_tools(limit=2))
    assert result["ready"] is True
    assert result["recommendedToolName"] == "market.sentiment.signal"
    assert result["recommendedArgs"] == {"symbols": ["BNB", "CAKE", "TWT"]}
    assert result["recommendations"][0]["score"] > result["recommendations"][1]["score"]


def test_cmc_agent_hub_recommender_prefers_asset_scoped_tools(monkeypatch) -> None:
    from app.services.cmc import agent_hub_recommendations as cmc_agent_hub_recommendations

    async def fake_status() -> dict[str, object]:
        return {
            "configured": True,
            "reachable": True,
            "ready": True,
            "endpoint": "https://mcp.coinmarketcap.com/mcp",
            "toolCount": 2,
            "toolSummaries": [
                {"name": "get_global_metrics_latest", "description": "Latest global market metrics", "inputSchema": {"properties": {}}},
                {"name": "get_cryptocurrency_quotes_latest", "description": "Latest cryptocurrency quote", "inputSchema": {"properties": {"symbol": {}}}},
            ],
        }

    monkeypatch.setattr(cmc_agent_hub_recommendations.CmcAgentHubClient, "get_cmc_agent_hub_status", fake_status)
    result = asyncio.run(cmc_agent_hub_recommendations.CmcAgentHubRecommendationService.recommend_cmc_agent_hub_signal_tools(limit=2))
    assert result["recommendedToolName"] == "get_cryptocurrency_quotes_latest"
    assert result["recommendedArgs"] == {"symbol": "BNB"}


def test_cmc_agent_hub_recommender_fails_closed_without_signal_like_tools(monkeypatch) -> None:
    from app.services.cmc import agent_hub_recommendations as cmc_agent_hub_recommendations

    async def fake_status() -> dict[str, object]:
        return {
            "configured": True,
            "reachable": True,
            "ready": True,
            "endpoint": "https://mcp.coinmarketcap.com/mcp",
            "toolCount": 1,
            "toolSummaries": [
                {"name": "account.profile", "description": "Account profile helper", "inputSchema": {"properties": {}}},
            ],
        }

    monkeypatch.setattr(cmc_agent_hub_recommendations.CmcAgentHubClient, "get_cmc_agent_hub_status", fake_status)
    result = asyncio.run(cmc_agent_hub_recommendations.CmcAgentHubRecommendationService.recommend_cmc_agent_hub_signal_tools(limit=2))
    assert result["ready"] is False
    assert result["recommendedToolName"] is None
    assert result["reason"] == "CMC Agent Hub returned tools, but no signal-like tools were identified."


def test_cmc_agent_hub_call_tool_requires_key(monkeypatch) -> None:
    for key in (
        "CMC_AGENT_HUB_API_KEY",
        "CMC_MCP_API_KEY",
        "CMC_PRO_API_KEY",
        "COINMARKETCAP_API_KEY",
        "X_CMC_PRO_API_KEY",
    ):
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "cmc_agent_hub_call_tool",
        {"toolName": "crypto.price.latest", "arguments": {"symbol": "BNB"}},
    ))
    assert result["source"] == "coinmarketcap-agent-hub-mcp"
    assert result["configured"] is False
    assert result["ready"] is False
    assert result["toolName"] == "crypto.price.latest"
    assert "CMC_MCP_API_KEY" in result["reason"]
    get_settings.cache_clear()


def test_cmc_agent_hub_call_tool_invokes_mcp_tool(monkeypatch) -> None:
    from app.services.cmc import agent_hub_tools as cmc_agent_hub_tools

    calls: list[tuple[str, str | None, dict[str, object]]] = []

    async def fake_request(
        endpoint: str,
        api_key: str,
        method: str,
        params: dict[str, object],
        session_id: str | None = None,
    ) -> dict[str, object]:
        assert endpoint == "https://mcp.coinmarketcap.com/mcp"
        assert api_key == "cmc-test-key"
        calls.append((method, session_id, params))
        if method == "initialize":
            return {"sessionId": "cmc-session"}
        return {"content": [{"type": "text", "text": "{\"symbol\":\"BNB\",\"priceUsd\":600}"}]}

    async def fake_notification(
        endpoint: str,
        api_key: str,
        method: str,
        params: dict[str, object],
        session_id: str | None = None,
    ) -> None:
        assert endpoint == "https://mcp.coinmarketcap.com/mcp"
        assert api_key == "cmc-test-key"
        calls.append((method, session_id, params))

    monkeypatch.setenv("CMC_MCP_API_KEY", "cmc-test-key")
    get_settings.cache_clear()
    monkeypatch.setattr(cmc_agent_hub_tools.CmcAgentHubClient, "mcp_request", fake_request)
    monkeypatch.setattr(cmc_agent_hub_tools.CmcAgentHubClient, "mcp_notification", fake_notification)

    result = asyncio.run(cmc_agent_hub_tools.CmcAgentHubToolClient.call_cmc_agent_hub_tool({
        "toolName": "crypto.price.latest",
        "arguments": {"symbol": "BNB"},
    }))

    assert result["ready"] is True
    assert result["toolName"] == "crypto.price.latest"
    assert result["parsedContent"] == [{"symbol": "BNB", "priceUsd": 600}]
    assert calls[0][0:2] == ("initialize", None)
    assert calls[1][0:2] == ("notifications/initialized", "cmc-session")
    assert calls[2] == (
        "tools/call",
        "cmc-session",
        {"name": "crypto.price.latest", "arguments": {"symbol": "BNB"}},
    )
    get_settings.cache_clear()


def test_cmc_price_snapshot_deduplicates_and_caches(monkeypatch) -> None:
    from app.services.cmc import prices as cmc

    calls: list[dict[str, object]] = []

    class FakeResponse:
        text = ""
        headers: dict[str, str] = {}

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {
                "data": {
                    "BNB": {"quote": {"USD": {"price": 600, "percent_change_24h": 1.5}}},
                }
            }

    class FakeClient:
        def __init__(self, timeout: int) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
            return None

        async def get(
            self,
            url: str,
            params: dict[str, object],
            headers: dict[str, str],
        ) -> FakeResponse:
            calls.append({"url": url, "params": params, "headers": headers})
            return FakeResponse()

    monkeypatch.setenv("CMC_AGENT_HUB_API_KEY", "cmc-test-key")
    get_settings.cache_clear()
    cmc._PRICE_CACHE.clear()
    monkeypatch.setattr(cmc.httpx, "AsyncClient", FakeClient)

    first = asyncio.run(cmc.CmcPriceService.get_price_snapshot(["BNB", "BNB"]))
    second = asyncio.run(cmc.CmcPriceService.get_price_snapshot(["BNB"]))

    assert calls == [
        {
            "url": "https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest",
            "params": {"symbol": "BNB", "convert": "USD"},
            "headers": {"X-CMC_PRO_API_KEY": "cmc-test-key"},
        }
    ]
    assert first["symbols"] == {"BNB": {"symbol": "BNB", "priceUsd": 600, "percentChange24h": 1.5}}
    assert second["cached"] is True
    cmc._PRICE_CACHE.clear()
    get_settings.cache_clear()


def test_cmc_skill_hub_status_requires_key(monkeypatch) -> None:
    for key in ("CMC_SKILL_HUB_API_KEY", "CMC_MCP_API_KEY", "CMC_AGENT_HUB_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(client, csrf_token, "cmc_skill_hub_status", {}))
    assert result["source"] == "coinmarketcap-skill-hub-mcp"
    assert result["serverId"] == "cmc-skill-hub"
    assert result["transport"] == "streamable_http"
    assert result["configured"] is False
    assert result["ready"] is False
    assert result["endpoint"] == "https://mcp.coinmarketcap.com/skill-hub/stream"
    assert "CMC_SKILL_HUB_API_KEY" in result["reason"]
    get_settings.cache_clear()


def test_cmc_skill_hub_status_lists_find_and_execute(monkeypatch) -> None:
    from app.services.cmc import skill_hub as cmc_skill_hub

    calls: list[tuple[str, str | None, dict[str, object], int]] = []

    async def fake_request(
        endpoint: str,
        api_key: str,
        method: str,
        params: dict[str, object],
        session_id: str | None = None,
        timeout_sec: int = 15,
    ) -> dict[str, object]:
        assert endpoint == "https://mcp.coinmarketcap.com/skill-hub/stream"
        assert api_key == "skill-test-key"
        calls.append((method, session_id, params, timeout_sec))
        if method == "initialize":
            return {"sessionId": "skill-session"}
        return {
            "tools": [
                {"name": "find_skill", "description": "Find skills", "inputSchema": {"properties": {"query": {}}}},
                {"name": "execute_skill", "description": "Execute skills", "inputSchema": {"properties": {}}},
            ]
        }

    async def fake_notification(
        endpoint: str,
        api_key: str,
        method: str,
        params: dict[str, object],
        session_id: str | None = None,
        timeout_sec: int = 15,
    ) -> None:
        assert endpoint == "https://mcp.coinmarketcap.com/skill-hub/stream"
        assert api_key == "skill-test-key"
        calls.append((method, session_id, params, timeout_sec))

    monkeypatch.setenv("CMC_SKILL_HUB_API_KEY", "skill-test-key")
    get_settings.cache_clear()
    monkeypatch.setattr(cmc_skill_hub.CmcAgentHubClient, "mcp_request", fake_request)
    monkeypatch.setattr(cmc_skill_hub.CmcAgentHubClient, "mcp_notification", fake_notification)

    result = asyncio.run(cmc_skill_hub.CmcSkillHubClient.get_cmc_skill_hub_status())

    assert result["ready"] is True
    assert result["tools"] == ["find_skill", "execute_skill"]
    assert calls[0][0:2] == ("initialize", None)
    assert calls[1][0:2] == ("notifications/initialized", "skill-session")
    assert calls[2][0:2] == ("tools/list", "skill-session")
    get_settings.cache_clear()


def test_cmc_skill_hub_find_skill_invokes_backend_mcp(monkeypatch) -> None:
    from app.services.cmc import skill_hub as cmc_skill_hub

    calls: list[tuple[str, str | None, dict[str, object], int]] = []

    async def fake_request(
        endpoint: str,
        api_key: str,
        method: str,
        params: dict[str, object],
        session_id: str | None = None,
        timeout_sec: int = 15,
    ) -> dict[str, object]:
        calls.append((method, session_id, params, timeout_sec))
        if method == "initialize":
            return {"sessionId": "skill-session"}
        return {"content": [{"type": "text", "text": "{\"unique_name\":\"btc_cross_asset_correlation\"}"}]}

    async def fake_notification(
        endpoint: str,
        api_key: str,
        method: str,
        params: dict[str, object],
        session_id: str | None = None,
        timeout_sec: int = 15,
    ) -> None:
        calls.append((method, session_id, params, timeout_sec))

    monkeypatch.setenv("CMC_SKILL_HUB_API_KEY", "skill-test-key")
    get_settings.cache_clear()
    monkeypatch.setattr(cmc_skill_hub.CmcAgentHubClient, "mcp_request", fake_request)
    monkeypatch.setattr(cmc_skill_hub.CmcAgentHubClient, "mcp_notification", fake_notification)

    result = asyncio.run(cmc_skill_hub.CmcSkillHubClient.find_cmc_skill({"query": "btc price"}))

    assert result["ready"] is True
    assert result["toolName"] == "find_skill"
    assert result["parsedContent"] == [{"unique_name": "btc_cross_asset_correlation"}]
    assert calls[2] == (
        "tools/call",
        "skill-session",
        {"name": "find_skill", "arguments": {"query": "btc price"}},
        30,
    )
    get_settings.cache_clear()


def test_cmc_skill_hub_execute_skill_uses_300_second_timeout(monkeypatch) -> None:
    from app.services.cmc import skill_hub as cmc_skill_hub

    calls: list[tuple[str, str | None, dict[str, object], int]] = []

    async def fake_request(
        endpoint: str,
        api_key: str,
        method: str,
        params: dict[str, object],
        session_id: str | None = None,
        timeout_sec: int = 15,
    ) -> dict[str, object]:
        calls.append((method, session_id, params, timeout_sec))
        if method == "initialize":
            return {"sessionId": "skill-session"}
        return {"content": [{"type": "text", "text": "{\"ok\":true,\"status\":\"ok\"}"}]}

    async def fake_notification(
        endpoint: str,
        api_key: str,
        method: str,
        params: dict[str, object],
        session_id: str | None = None,
        timeout_sec: int = 15,
    ) -> None:
        calls.append((method, session_id, params, timeout_sec))

    monkeypatch.setenv("CMC_SKILL_HUB_API_KEY", "skill-test-key")
    get_settings.cache_clear()
    monkeypatch.setattr(cmc_skill_hub.CmcAgentHubClient, "mcp_request", fake_request)
    monkeypatch.setattr(cmc_skill_hub.CmcAgentHubClient, "mcp_notification", fake_notification)

    result = asyncio.run(cmc_skill_hub.CmcSkillHubClient.execute_cmc_skill({
        "unique_name": "btc_cross_asset_correlation",
        "parameters": {"preview": True},
    }))

    assert result["ready"] is True
    assert result["toolName"] == "execute_skill"
    assert result["parsedContent"] == [{"ok": True, "status": "ok"}]
    assert calls[0][3] == 300
    assert calls[1][3] == 300
    assert calls[2] == (
        "tools/call",
        "skill-session",
        {
            "name": "execute_skill",
            "arguments": {
                "unique_name": "btc_cross_asset_correlation",
                "parameters": {"preview": True},
            },
        },
        300,
    )
    get_settings.cache_clear()


def test_cmc_daily_market_overview_tool_is_allowlisted_and_runs(monkeypatch) -> None:
    async def fake_run(args: dict[str, object]) -> dict[str, object]:
        return {
            "ready": True,
            "skillName": "daily_market_overview",
            "parameters": args,
            "formattedReport": "**TL;DR**\n\nMarket report ready.\n\n———\n\n**Details**",
        }

    monkeypatch.setattr("app.services.adapters.runtime.CmcDailyMarketOverviewService.run", fake_run)
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]

    listed = client.post(
        "/api/mcp",
        headers={"X-CSRF-Token": csrf_token},
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
    )
    tool_names = [tool["name"] for tool in listed.json()["result"]["tools"]]
    assert "cmc_daily_market_overview" in tool_names

    result = parsed_tool_result(call_mcp(client, csrf_token, "cmc_daily_market_overview", {"preview": True}))
    assert result["ready"] is True
    assert result["skillName"] == "daily_market_overview"
    assert result["parameters"] == {"preview": True}
    get_settings.cache_clear()


def test_paid_resource_status_defaults_to_not_claimed(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_X402_ENABLED", "false")
    monkeypatch.setenv("X402_FACILITATOR_URL", "")
    monkeypatch.setenv("X402_PAYMENT_VERIFIER_URL", "")
    monkeypatch.setenv("TW_ACCESS_ID", "")
    monkeypatch.setenv("TW_HMAC_SECRET", "")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(client, csrf_token, "bnb_paid_resource_status", {}))
    assert result["ready"] is False
    assert result["x402Configured"] is False
    assert result["paymentVerifierConfigured"] is False
    assert result["claimStatus"] == "not_claimed"
    assert "X402_PAYMENT_VERIFIER_URL" in result["missingEnv"]
    get_settings.cache_clear()


def test_capital_readiness_requires_gas_and_trade_asset(monkeypatch) -> None:
    from app.services.wallet.balances import CapitalReadinessService

    async def fake_native_balance(wallet_address: str) -> int:
        assert wallet_address == "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"
        return 100_000_000_000_000_000

    async def fake_erc20_balance(token_address: str, wallet_address: str) -> int:
        assert wallet_address == "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"
        return 25_000_000_000_000_000_000 if token_address.startswith("0x55d398") else 0

    monkeypatch.setattr(CapitalReadinessService, "native_balance", fake_native_balance)
    monkeypatch.setattr(CapitalReadinessService, "erc20_balance", fake_erc20_balance)
    result = asyncio.run(CapitalReadinessService.get_capital_readiness("0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"))
    assert result["ready"] is True
    assert result["status"] == "ready"
    assert result["gasReady"] is True
    assert result["tradeAssetReady"] is True


def test_capital_readiness_accepts_spendable_bnb_after_gas_reserve(monkeypatch) -> None:
    from app.services.wallet.balances import CapitalReadinessService

    async def fake_native_balance(wallet_address: str) -> int:
        assert wallet_address == "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"
        return 1_000_000_000_000_000

    async def fake_erc20_balance(token_address: str, wallet_address: str) -> int:
        assert wallet_address == "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"
        return 0

    monkeypatch.setattr(CapitalReadinessService, "native_balance", fake_native_balance)
    monkeypatch.setattr(CapitalReadinessService, "erc20_balance", fake_erc20_balance)
    monkeypatch.setenv("BNB_MIN_GAS_RESERVE_WEI", "500000000000000")
    get_settings.cache_clear()
    result = asyncio.run(CapitalReadinessService.get_capital_readiness("0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"))
    bnb = next(item for item in result["balances"] if item["symbol"] == "BNB")
    assert result["ready"] is True
    assert result["gasReady"] is True
    assert result["tradeAssetReady"] is True
    assert bnb["spendableRaw"] == "500000000000000"
    get_settings.cache_clear()


def test_paid_resource_status_requires_trusted_verifier(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"baseUrl": "http://twak.local"}))
    monkeypatch.setenv("ROBOT_FLEET_X402_ENABLED", "true")
    monkeypatch.setenv("X402_FACILITATOR_URL", "https://x402.example")
    monkeypatch.setenv("X402_PAYMENT_VERIFIER_URL", "")
    monkeypatch.setenv("TW_ACCESS_ID", "access-id")
    monkeypatch.setenv("TW_HMAC_SECRET", "secret")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(client, csrf_token, "bnb_paid_resource_status", {}))
    assert result["x402Configured"] is True
    assert result["ready"] is False
    assert result["paymentVerifierConfigured"] is False
    assert result["claimStatus"] == "not_claimed"
    get_settings.cache_clear()


def test_cmc_api_key_accepts_common_aliases(monkeypatch) -> None:
    for key in (
        "CMC_AGENT_HUB_API_KEY",
        "CMC_MCP_API_KEY",
        "CMC_PRO_API_KEY",
        "COINMARKETCAP_API_KEY",
        "X_CMC_PRO_API_KEY",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("COINMARKETCAP_API_KEY", "cmc-test-key")
    get_settings.cache_clear()
    assert get_settings().cmc_api_key == "cmc-test-key"
    get_settings.cache_clear()


def test_record_paid_signal_access_remains_unverified_without_verifier(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"baseUrl": "http://twak.local"}))
    monkeypatch.setenv("ROBOT_FLEET_X402_ENABLED", "true")
    monkeypatch.setenv("X402_FACILITATOR_URL", "https://x402.example")
    monkeypatch.setenv("X402_PAYMENT_VERIFIER_URL", "")
    monkeypatch.setenv("TW_ACCESS_ID", "access-id")
    monkeypatch.setenv("TW_HMAC_SECRET", "secret")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_record_paid_signal_access",
        {"resource": "twak_x402", "txHash": "0x" + "1" * 64, "amountUsd": 0.01},
    ))
    assert result["verified"] is False
    assert result["event"]["eventType"] == "paid_resource_failed"
    assert result["event"]["payload"]["paymentVerifierConfigured"] is False
    get_settings.cache_clear()


def test_agent_sdk_identity_dry_run_generates_agent_uri(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_agent_sdk_register_identity",
        {
            "submit": False,
            "name": "OmniAgent BNB Trader",
            "endpoint": "https://omniagent.example/.well-known/agent-card.json",
        },
    ))
    assert result["submitted"] is False
    assert result["status"] == "dry_run"
    assert result["agentUriGenerated"] is True
    assert result["agentUri"].startswith("data:application/json;base64,")
    assert result["agentWallet"] == "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"
    get_settings.cache_clear()


def test_agent_sdk_identity_rejects_unparseable_agent_uri() -> None:
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    response = call_mcp(
        client,
        csrf_token,
        "bnb_agent_sdk_register_identity",
        {
            "submit": False,
            "walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
            "agentUri": "ipfs://omniagent",
        },
    )
    assert response["error"]["message"] == "agentUri must be a BNB SDK data URI or an https:// URI."


def test_agent_sdk_identity_submit_blocked_without_registration_flag(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("BNB_AGENT_SDK_ENABLED", "true")
    monkeypatch.setenv("BNB_AGENT_SDK_REGISTRATION_ENABLED", "false")
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_agent_sdk_register_identity",
        {
            "submit": True,
            "endpoint": "https://omniagent.example/.well-known/agent-card.json",
        },
    ))
    assert result["submitted"] is False
    assert result["status"] == "blocked"
    assert result["reason"] == "BNB_AGENT_SDK_REGISTRATION_ENABLED is false."
    get_settings.cache_clear()


def test_execute_trade_blocks_without_router_transaction() -> None:
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_execute_trade",
        {"tradeIntentId": "intent-test"},
    ))
    assert result["status"] == "blocked"
    assert result["simulation"]["canExecute"] is False
    assert "router-backed transaction is required" in result["simulation"]["reason"]


def test_execute_trade_blockers_require_competition_registration(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    monkeypatch.setattr(
        "app.services.wallet.agent_wallet.AgentWalletService.get_wallet_data",
        lambda: {"walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25", "twakReady": True},
    )
    get_settings.cache_clear()
    reasons = TradeExecutionService.execution_blockers(
        {"chainId": 56, "data": "0x1234"},
        {"approved": True, "reasons": []},
        {"ready": True},
        {"configured": True, "reachable": True, "symbols": {"BNB": {"priceUsd": 1}}},
        {
            "ready": True,
            "toolName": "crypto.signal.test",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert "competition registration proof is required before live execution" in reasons
    get_settings.cache_clear()


def blocked_reasons_with_registration_event(monkeypatch, tmp_path, payload: dict[str, object], tx_hash: str = "0x" + "c" * 64) -> list[str]:
    ledger_path = tmp_path / "ledger.jsonl"
    ledger_path.write_text(json.dumps({
        "eventType": "competition_registered",
        "txHash": tx_hash,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
    }) + "\n", encoding="utf-8")
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    monkeypatch.setattr(
        "app.services.wallet.agent_wallet.AgentWalletService.get_wallet_data",
        lambda: {"walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25", "twakReady": True},
    )
    get_settings.cache_clear()
    return TradeExecutionService.execution_blockers(
        {"chainId": 56, "data": "0x1234"},
        {"approved": True, "reasons": []},
        {"ready": True},
        {"configured": True, "reachable": True, "symbols": {"BNB": {"priceUsd": 1}}},
        {
            "ready": True,
            "toolName": "crypto.signal.test",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


def test_execute_trade_blockers_reject_registration_proof_for_another_wallet(monkeypatch, tmp_path) -> None:
    reasons = blocked_reasons_with_registration_event(monkeypatch, tmp_path, {
        "walletAddress": "0x1111111111111111111111111111111111111111",
        "competitionContractAddress": "0x212c61b9b72c95d95bf29cf032f5e5635629aed5",
        "chainId": 56,
    })
    assert "competition registration proof is required before live execution" in reasons
    get_settings.cache_clear()


def test_execute_trade_blockers_reject_registration_proof_for_wrong_contract(monkeypatch, tmp_path) -> None:
    reasons = blocked_reasons_with_registration_event(monkeypatch, tmp_path, {
        "walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
        "competitionContractAddress": "0x1111111111111111111111111111111111111111",
        "chainId": 56,
    })
    assert "competition registration proof is required before live execution" in reasons
    get_settings.cache_clear()


def test_execute_trade_blockers_reject_registration_proof_for_wrong_chain(monkeypatch, tmp_path) -> None:
    reasons = blocked_reasons_with_registration_event(monkeypatch, tmp_path, {
        "walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
        "competitionContractAddress": "0x212c61b9b72c95d95bf29cf032f5e5635629aed5",
        "chainId": 97,
    })
    assert "competition registration proof is required before live execution" in reasons
    get_settings.cache_clear()


def test_execute_trade_blockers_reject_registration_proof_with_invalid_tx_hash(monkeypatch, tmp_path) -> None:
    reasons = blocked_reasons_with_registration_event(
        monkeypatch,
        tmp_path,
        {
            "walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
            "competitionContractAddress": "0x212c61b9b72c95d95bf29cf032f5e5635629aed5",
            "chainId": 56,
        },
        tx_hash="0xnot-real",
    )
    assert "competition registration proof is required before live execution" in reasons
    get_settings.cache_clear()


def test_live_cmc_tool_blocker_rejects_stale_signal() -> None:
    reason = CmcSignalConfigService.live_cmc_tool_blocker(
        True,
        "crypto.signal.test",
        {
            "ready": True,
            "toolName": "crypto.signal.test",
            "timestamp": "2026-01-01T00:00:00+00:00",
        },
    )
    assert reason == "CMC Agent Hub signal is stale; refresh it before live execution."


def test_risk_check_blocks_slippage_above_limit(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("BNB_MAX_SLIPPAGE_BPS", "25")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_risk_check",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 50, "signalSource": "cmc"},
    ))
    assert result["approved"] is False
    assert "slippage_exceeds_limit" in result["reasons"]
    get_settings.cache_clear()


def test_risk_check_blocks_daily_limit(monkeypatch, tmp_path) -> None:
    ledger_path = tmp_path / "ledger.jsonl"
    ledger_path.write_text(json.dumps({
        "eventType": "trade_executed",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "payload": {},
    }) + "\n", encoding="utf-8")
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    monkeypatch.setenv("BNB_MAX_DAILY_TRADES", "1")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_risk_check",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert result["approved"] is False
    assert "daily_trade_limit_reached" in result["reasons"]
    get_settings.cache_clear()


def test_risk_check_blocks_drawdown_cap(monkeypatch, tmp_path) -> None:
    ledger_path = tmp_path / "ledger.jsonl"
    ledger_path.write_text(json.dumps({
        "eventType": "pnl_updated",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "payload": {"totalReturnPct": -31, "maxDrawdownPct": 31},
    }) + "\n", encoding="utf-8")
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    monkeypatch.setenv("BNB_MAX_DRAWDOWN_PCT", "30")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_risk_check",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert result["approved"] is False
    assert "drawdown_cap_reached" in result["reasons"]
    get_settings.cache_clear()


def test_risk_check_requires_cmc_signal(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_risk_check",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": ""},
    ))
    assert result["approved"] is False
    assert "cmc_signal_required" in result["reasons"]
    get_settings.cache_clear()


def test_trade_status_rejects_invalid_tx_hash() -> None:
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    response = call_mcp(
        client,
        csrf_token,
        "bnb_get_trade_status",
        {"txHash": "not-a-tx"},
    )
    assert response["error"]["message"] == "A valid BSC transaction hash is required."


def test_trade_status_confirms_router_wallet_and_calldata_proof(monkeypatch, tmp_path) -> None:
    tx_hash = "0x" + "a" * 64

    async def fake_rpc_call(method: str, params: list[object]) -> object:
        if method == "eth_getTransactionReceipt":
            return {
                "status": "0x1",
                "blockNumber": "0x10",
                "from": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
                "to": "0x10ED43C718714eb63d5aA57B78B54704E256024E",
            }
        if method == "eth_getTransactionByHash":
            return {
                "from": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
                "to": "0x10ED43C718714eb63d5aA57B78B54704E256024E",
                "input": "0x38ed1739" + "00" * 64,
            }
        raise AssertionError(method)

    monkeypatch.setattr("app.services.trading.receipt.ReceiptProofService.rpc_call", fake_rpc_call)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()
    TradeLedger.append_event({
        "eventType": "trade_executed",
        "tradeIntentId": "intent-proof",
        "txHash": tx_hash,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "bridgeMode": "rest",
            "walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
            "cmcAgentHubSignal": {
                "toolName": "crypto.signal.test",
                "ready": True,
                "serverVerified": True,
            },
        },
    })
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_get_trade_status",
        {"txHash": tx_hash, "tradeIntentId": "intent-proof"},
    ))
    assert result["status"] == "confirmed"
    assert result["proof"]["valid"] is True
    assert result["submissionProof"]["cmcAgentHubSignal"]["serverVerified"] is True
    assert result["ledgerEvent"]["eventType"] == "trade_receipt_confirmed"
    assert result["ledgerEvent"]["payload"]["submissionProof"]["cmcAgentHubSignal"]["toolName"] == "crypto.signal.test"

    ledger = parsed_tool_result(call_mcp(client, csrf_token, "bnb_trade_ledger_summary", {"limit": 5}))
    assert ledger["dailyCompliance"]["tradeCount"] == 1
    assert ledger["dailyCompliance"]["progress"] == "1/7"
    second = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_get_trade_status",
        {"txHash": tx_hash, "tradeIntentId": "intent-proof"},
    ))
    assert second["ledgerEvent"] == result["ledgerEvent"]
    ledger = parsed_tool_result(call_mcp(client, csrf_token, "bnb_trade_ledger_summary", {"limit": 5}))
    assert ledger["dailyCompliance"]["tradeCount"] == 1
    get_settings.cache_clear()


def test_trade_status_accepts_twak_rest_executor_with_cmc_submission_proof(monkeypatch, tmp_path) -> None:
    tx_hash = "0x" + "b" * 64

    async def fake_rpc_call(method: str, params: list[object]) -> object:
        if method == "eth_getTransactionReceipt":
            return {
                "status": "0x1",
                "blockNumber": "0x20",
                "from": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
                "to": "0xf064b069ed18eb5c61159247c55c5af79b28a968",
            }
        if method == "eth_getTransactionByHash":
            return {
                "from": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
                "to": "0xf064b069ed18eb5c61159247c55c5af79b28a968",
                "input": "0x0947c2d9" + "00" * 64,
            }
        raise AssertionError(method)

    monkeypatch.setattr("app.services.trading.receipt.ReceiptProofService.rpc_call", fake_rpc_call)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()
    TradeLedger.append_event({
        "eventType": "trade_executed",
        "tradeIntentId": "intent-twak-rest",
        "txHash": tx_hash,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "bridgeMode": "rest",
            "walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
            "cmcAgentHubSignal": {
                "toolName": "get_global_metrics_latest",
                "ready": True,
                "serverVerified": True,
            },
        },
    })
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_get_trade_status",
        {"txHash": tx_hash, "tradeIntentId": "intent-twak-rest"},
    ))

    assert result["status"] == "confirmed"
    assert result["proof"]["valid"] is True
    assert result["proof"]["expected"]["to"] == "twak_rest_executor"
    assert result["proof"]["bridgeMode"] == "rest"
    assert result["ledgerEvent"]["eventType"] == "trade_receipt_confirmed"
    get_settings.cache_clear()


def test_live_proof_bundle_returns_preflight_ledger_and_receipt(monkeypatch, tmp_path) -> None:
    tx_hash = "0x" + "f" * 64

    async def fake_preflight(args: dict[str, object]) -> dict[str, object]:
        return {
            "readyForLiveTrade": False,
            "readyToEnableLive": False,
            "blockers": [{"name": "cmc_agent_hub_signal", "ok": False, "reason": "missing"}],
        }

    async def fake_trade_status(args: dict[str, object]) -> dict[str, object]:
        assert args["txHash"] == tx_hash
        return {"status": "pending", "txHash": tx_hash}

    monkeypatch.setattr("app.services.trading.live_preflight.LivePreflightService.get_live_preflight", fake_preflight)
    monkeypatch.setattr("app.services.trading.receipt.ReceiptProofService.get_trade_status", fake_trade_status)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    TradeLedger.append_event({
        "eventType": "trade_executed",
        "tradeIntentId": "intent-proof",
        "txHash": tx_hash,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "payload": {"bridgeMode": "rest", "walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"},
    })
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_live_proof_bundle",
        {"limit": 5, "refreshReceipt": True},
    ))
    assert result["status"] == "blocked"
    assert result["latestSubmission"]["txHash"] == tx_hash
    assert result["latestReceiptStatus"]["status"] == "pending"
    assert "backend auto-discovers a signal tool" in result["nextActions"][0]
    get_settings.cache_clear()


def test_trade_status_does_not_count_router_mismatch(monkeypatch, tmp_path) -> None:
    tx_hash = "0x" + "b" * 64

    async def fake_rpc_call(method: str, params: list[object]) -> object:
        if method == "eth_getTransactionReceipt":
            return {
                "status": "0x1",
                "blockNumber": "0x11",
                "from": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
                "to": "0x1111111111111111111111111111111111111111",
            }
        if method == "eth_getTransactionByHash":
            return {
                "from": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
                "to": "0x1111111111111111111111111111111111111111",
                "input": "0x38ed1739" + "00" * 64,
            }
        raise AssertionError(method)

    monkeypatch.setattr("app.services.trading.receipt.ReceiptProofService.rpc_call", fake_rpc_call)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(client, csrf_token, "bnb_get_trade_status", {"txHash": tx_hash}))
    assert result["status"] == "confirmed"
    assert result["proof"]["valid"] is False
    assert "router_mismatch" in result["proof"]["reasons"]
    assert "ledgerEvent" not in result

    ledger = parsed_tool_result(call_mcp(client, csrf_token, "bnb_trade_ledger_summary", {"limit": 5}))
    assert ledger["dailyCompliance"]["tradeCount"] == 0
    get_settings.cache_clear()


def test_trade_status_validates_expected_calldata_prefix(monkeypatch, tmp_path) -> None:
    tx_hash = "0x" + "c" * 64

    async def fake_rpc_call(method: str, params: list[object]) -> object:
        if method == "eth_getTransactionReceipt":
            return {
                "status": "0x1",
                "blockNumber": "0x12",
                "from": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
                "to": "0x10ED43C718714eb63d5aA57B78B54704E256024E",
            }
        if method == "eth_getTransactionByHash":
            return {
                "from": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
                "to": "0x10ED43C718714eb63d5aA57B78B54704E256024E",
                "input": "0x38ed1739" + "00" * 64,
            }
        raise AssertionError(method)

    monkeypatch.setattr("app.services.trading.receipt.ReceiptProofService.rpc_call", fake_rpc_call)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_get_trade_status",
        {"txHash": tx_hash, "expectedDataPrefix": "0x7ff36ab5"},
    ))
    assert result["proof"]["valid"] is False
    assert "calldata_prefix_mismatch" in result["proof"]["reasons"]
    assert "ledgerEvent" not in result
    get_settings.cache_clear()


def test_risk_check_blocks_token_outside_allowlist(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_risk_check",
        {"symbol": "NOTREAL", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert result["approved"] is False
    assert "token_not_allowlisted" in result["reasons"]
    get_settings.cache_clear()


def test_risk_check_blocks_emergency_pause(monkeypatch, tmp_path) -> None:
    ledger_path = tmp_path / "ledger.jsonl"
    ledger_path.write_text(json.dumps({
        "eventType": "trade_blocked",
        "action": "emergency_pause",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "payload": {"emergencyPaused": True},
    }) + "\n", encoding="utf-8")
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_risk_check",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert result["approved"] is False
    assert "emergency_pause_enabled" in result["reasons"]
    get_settings.cache_clear()


def test_emergency_pause_tool_persists_latest_control_state(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]

    pause = parsed_tool_result(call_mcp(client, csrf_token, "bnb_emergency_pause", {"enabled": True}))
    assert pause["emergencyPaused"] is True
    blocked = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_risk_check",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 1, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert "emergency_pause_enabled" in blocked["reasons"]

    unpause = parsed_tool_result(call_mcp(client, csrf_token, "bnb_emergency_pause", {"enabled": False}))
    assert unpause["emergencyPaused"] is False
    allowed = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_risk_check",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 1, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert "emergency_pause_enabled" not in allowed["reasons"]
    get_settings.cache_clear()


def test_execute_trade_blocks_when_twak_disabled(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "disabled")
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_execute_trade",
        {
            "tradeIntentId": "intent-test",
            "symbol": "CAKE",
            "side": "buy",
            "amountUsd": 10,
            "slippageBps": 20,
            "signalSource": "cmc",
            "transaction": {"chainId": 56, "to": "0x10ED43C718714eb63d5aA57B78B54704E256024E"},
        },
    ))
    assert result["status"] == "blocked"
    assert "Trust Wallet Agent Kit is disabled" in result["simulation"]["reason"]
    get_settings.cache_clear()


def test_trust_wallet_status_reports_disabled_mode(monkeypatch) -> None:
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "disabled")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", "")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(client, csrf_token, "bnb_trust_wallet_status", {}))
    assert result["enabled"] is False
    assert result["ready"] is False
    assert result["reason"] == "Trust Wallet Agent Kit is disabled"
    get_settings.cache_clear()


def test_trust_wallet_status_validates_rest_wallet(monkeypatch, tmp_path) -> None:
    async def fake_probe_rest_actions(config: object) -> dict[str, object]:
        return {
            "path": "/actions",
            "ok": True,
            "statusCode": 200,
            "payload": {"actions": [{"name": "get_address"}, {"name": "swap"}]},
        }

    async def fake_probe_rest_action(config: object, action: str, arguments: dict[str, object]) -> dict[str, object]:
        if action == "get_address":
            return {
                "path": "/actions/get_address",
                "ok": True,
                "statusCode": 200,
                "payload": {"address": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"},
            }
        return {"path": f"/actions/{action}", "ok": True, "statusCode": 200, "payload": {"state": "local"}}

    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.probe_rest_actions", fake_probe_rest_actions)
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.probe_rest_action", fake_probe_rest_action)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"baseUrl": "http://twak.local"}))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(client, csrf_token, "bnb_trust_wallet_status", {}))
    assert result["enabled"] is True
    assert result["reachable"] is True
    assert result["walletValidated"] is True
    assert result["actionsValidated"] is True
    assert result["ready"] is True
    assert result["actions"] == ["get_address", "swap"]
    assert result["requiredActions"] == ["swap"]
    assert result["observedWallet"] == "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"
    get_settings.cache_clear()


def test_trust_wallet_status_blocks_rest_without_swap_action(monkeypatch, tmp_path) -> None:
    async def fake_probe_rest_actions(config: object) -> dict[str, object]:
        return {
            "path": "/actions",
            "ok": True,
            "statusCode": 200,
            "payload": {"actions": [{"name": "get_address"}]},
        }

    async def fake_probe_rest_action(config: object, action: str, arguments: dict[str, object]) -> dict[str, object]:
        if action == "get_address":
            return {
                "path": "/actions/get_address",
                "ok": True,
                "statusCode": 200,
                "payload": {"address": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"},
            }
        return {"path": f"/actions/{action}", "ok": True, "statusCode": 200, "payload": {"state": "local"}}

    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.probe_rest_actions", fake_probe_rest_actions)
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.probe_rest_action", fake_probe_rest_action)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"baseUrl": "http://twak.local"}))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(client, csrf_token, "bnb_trust_wallet_status", {}))
    assert result["enabled"] is True
    assert result["reachable"] is True
    assert result["walletValidated"] is True
    assert result["actionsValidated"] is False
    assert result["ready"] is False
    assert result["actions"] == ["get_address"]
    assert result["requiredActions"] == ["swap"]
    assert result["reason"] == "TWAK REST bridge does not expose required swap action"
    get_settings.cache_clear()


def test_execute_trade_blocks_when_twak_rest_surface_is_not_configured(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", "")
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_execute_trade",
        {
            "tradeIntentId": "intent-test",
            "symbol": "CAKE",
            "side": "buy",
            "amountUsd": 10,
            "slippageBps": 20,
            "signalSource": "cmc",
            "transaction": {
                "chainId": 56,
                "to": "0x10ED43C718714eb63d5aA57B78B54704E256024E",
                "data": "0x38ed1739",
            },
        },
    ))
    assert result["status"] == "blocked"
    assert "TWAK REST bridge baseUrl is not configured" in result["simulation"]["reason"]
    get_settings.cache_clear()


def test_quote_trade_builds_pancake_router_transaction(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_quote_trade",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20},
    ))
    quote = result["quote"]
    assert quote["routerAddress"] == "0x10ED43C718714eb63d5aA57B78B54704E256024E"
    assert quote["inputSymbol"] == "USDT"
    assert quote["outputSymbol"] == "CAKE"
    assert quote["quoteSource"] == "router"
    assert quote["expectedOutputRaw"] == "5000000000000000000"
    assert quote["minOutputRaw"] == "4990000000000000000"
    assert quote["transaction"]["chainId"] == 56
    assert quote["transaction"]["data"].startswith("0x")
    get_settings.cache_clear()


def test_simulate_trade_builds_transaction_from_symbol_args(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("BNB_TRADING_ENABLED", "false")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "false")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_simulate_trade",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert result["simulation"]["transaction"]["to"] == "0x10ED43C718714eb63d5aA57B78B54704E256024E"
    assert "BNB live trading is disabled" in result["simulation"]["reason"]
    get_settings.cache_clear()


def test_autonomous_cycle_runs_backend_quote_risk_simulation(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    async def fake_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {symbol: {"symbol": symbol, "priceUsd": 1} for symbol in (symbols or [])},
        }

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_price_snapshot)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("BNB_TRADING_ENABLED", "false")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "false")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_run_autonomous_cycle",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert result["mode"] == "dry_run"
    assert result["cmcSnapshot"]["configured"] is True
    assert result["quote"]["quoteSource"] == "router"
    assert result["risk"]["approved"] is True
    assert result["strategyDecision"]["decision"]["action"] == "buy"
    assert result["execution"]["simulation"]["canExecute"] is False
    assert "bnb_quote_trade" in result["toolsUsed"]
    assert "bnb_strategy_decision" in result["toolsUsed"]
    assert result["ledgerEvent"]["eventType"] == "autonomous_cycle_completed"
    get_settings.cache_clear()


def test_autonomous_cycle_holds_on_bad_momentum(monkeypatch, tmp_path) -> None:
    async def fake_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {
                symbol: {
                    "symbol": symbol,
                    "priceUsd": 1,
                    "percentChange1h": -2,
                    "percentChange24h": -9,
                    "percentChange7d": -15,
                } for symbol in (symbols or [])
            },
        }

    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_price_snapshot)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_run_autonomous_cycle",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert result["status"] == "blocked"
    assert result["strategyDecision"]["decision"]["action"] == "hold"
    assert "falling_knife_momentum" in result["strategyDecision"]["decision"]["rationale"]
    assert result["quote"] == {}
    assert "bnb_quote_trade" not in result["toolsUsed"]
    get_settings.cache_clear()


def test_heikin_ashi_signal_detects_downtrend() -> None:
    result = HeikinAshiSignalService.evaluate(downtrend_chart(), period="5m", source="unit")
    assert result["ready"] is True
    assert result["type"] == "sell"
    assert result["label"] == "SELL"
    assert result["period"] == "5m"


def test_strategy_holds_buy_against_heikin_ashi_sell_signal(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("BNB_STRATEGY_ADVISOR_ENABLED", "false")
    get_settings.cache_clear()
    result = asyncio.run(TradingStrategyDecisionService.evaluate(
        symbol="BNB",
        side="buy",
        amount_usd=10,
        slippage_bps=20,
        cmc_snapshot={
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {"BNB": {"symbol": "BNB", "priceUsd": 600}},
        },
        cmc_agent_hub_signal={
            "ready": True,
            "toolName": "market.chart.signal",
            "parsedContent": {"chart": downtrend_chart()},
        },
        execute=False,
    ))
    assert result["decision"]["action"] == "hold"
    assert "heikin_ashi_5m_sell_signal" in result["decision"]["rationale"]
    assert result["deterministic"]["decision"]["dataQuality"] == "medium"
    get_settings.cache_clear()


def test_autonomous_cycle_invokes_configured_cmc_agent_hub_tool(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    async def fake_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {symbol: {"symbol": symbol, "priceUsd": 1} for symbol in (symbols or [])},
        }

    async def fake_agent_hub_tool(args: dict[str, object]) -> dict[str, object]:
        assert args == {
            "toolName": "crypto.signal.test",
            "arguments": {"symbol": "CAKE", "side": "buy", "amountUsd": 10.0},
        }
        return {"ready": True, "parsedContent": [{"signal": "hold"}]}

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_price_snapshot)
    monkeypatch.setattr("app.services.cmc.agent_hub_tools.CmcAgentHubToolClient.call_cmc_agent_hub_tool", fake_agent_hub_tool)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("CMC_AGENT_HUB_SIGNAL_TOOL", "crypto.signal.test")
    monkeypatch.setenv("BNB_TRADING_ENABLED", "false")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "false")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_run_autonomous_cycle",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert "cmc_agent_hub_call_tool" in result["toolsUsed"]
    assert result["cmcAgentHubSignal"]["parsedContent"] == [{"signal": "hold"}]
    assert any(stage["stage"] == "sense_agent_hub" and stage["state"] == "completed" for stage in result["stages"])
    get_settings.cache_clear()


def test_autonomous_cycle_auto_discovers_cmc_agent_hub_tool(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    async def fake_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {symbol: {"symbol": symbol, "priceUsd": 1} for symbol in (symbols or [])},
        }

    async def fake_recommendation(limit: int = 1) -> dict[str, object]:
        return {
            "ready": True,
            "recommendedToolName": "crypto.signal.auto",
            "recommendedArgs": {"symbol": "CAKE"},
        }

    async def fake_agent_hub_tool(args: dict[str, object]) -> dict[str, object]:
        assert args == {"toolName": "crypto.signal.auto", "arguments": {"symbol": "CAKE"}}
        return {"ready": True, "parsedContent": [{"signal": "buy"}]}

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_price_snapshot)
    monkeypatch.setattr("app.services.cmc.agent_hub_recommendations.CmcAgentHubRecommendationService.recommend_cmc_agent_hub_signal_tools", fake_recommendation)
    monkeypatch.setattr("app.services.cmc.agent_hub_tools.CmcAgentHubToolClient.call_cmc_agent_hub_tool", fake_agent_hub_tool)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("BNB_TRADING_ENABLED", "false")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "false")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_run_autonomous_cycle",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert "cmc_agent_hub_call_tool" in result["toolsUsed"]
    assert result["cmcAgentHubSignal"]["parsedContent"] == [{"signal": "buy"}]
    assert result["cmcAgentHubSignal"]["resolution"] == "auto_discovered"
    assert any(stage["stage"] == "sense_agent_hub" and stage["state"] == "completed" for stage in result["stages"])
    get_settings.cache_clear()


def test_autonomous_cycle_uses_cmc_price_for_bnb_sell_quote(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        assert amount_in_raw == "250000000000000"
        return [int(amount_in_raw), 200_000_000_000_000_000]

    async def fake_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {symbol: {"symbol": symbol, "priceUsd": 1000} for symbol in (symbols or [])},
        }

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_price_snapshot)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("BNB_TRADING_ENABLED", "false")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "false")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_run_autonomous_cycle",
        {"symbol": "BNB", "side": "sell", "amountUsd": 0.25, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert result["quote"]["inputSymbol"] == "BNB"
    assert result["quote"]["outputSymbol"] == "USDT"
    assert result["quote"]["amountInRaw"] == "250000000000000"
    assert result["risk"]["approved"] is True
    get_settings.cache_clear()


def test_autonomous_cycle_execute_request_still_blocks_without_live_flags(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    async def fake_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {symbol: {"symbol": symbol, "priceUsd": 1} for symbol in (symbols or [])},
        }

    async def fake_agent_hub_tool(args: dict[str, object]) -> dict[str, object]:
        assert args["toolName"] == "crypto.signal.test"
        return {"ready": True, "parsedContent": [{"signal": "buy"}]}

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_price_snapshot)
    monkeypatch.setattr("app.services.cmc.agent_hub_tools.CmcAgentHubToolClient.call_cmc_agent_hub_tool", fake_agent_hub_tool)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("CMC_AGENT_HUB_SIGNAL_TOOL", "crypto.signal.test")
    monkeypatch.setenv("BNB_TRADING_ENABLED", "false")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "false")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_run_autonomous_cycle",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc", "execute": True},
    ))
    assert result["mode"] == "execute"
    assert result["status"] == "blocked"
    assert "BNB live trading is disabled" in result["execution"]["simulation"]["reason"]
    assert "bnb_execute_trade" in result["toolsUsed"]
    get_settings.cache_clear()


def test_autonomous_cycle_execute_requires_cmc_agent_hub_tool(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    async def fake_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {symbol: {"symbol": symbol, "priceUsd": 1} for symbol in (symbols or [])},
        }

    async def fake_execute_trade(args: dict[str, object]) -> dict[str, object]:
        raise AssertionError("execute_trade must not run without CMC Agent Hub tool proof")

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_price_snapshot)
    monkeypatch.setattr("app.services.trading.execution.TradeExecutionService.execute_trade", fake_execute_trade)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_run_autonomous_cycle",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc", "execute": True},
    ))
    assert result["mode"] == "execute"
    assert result["status"] == "blocked"
    assert result["execution"]["reason"] == "CMC Agent Hub signal tool is required before live execution."
    assert any(stage["stage"] == "sense_agent_hub" and stage["state"] == "blocked" for stage in result["stages"])
    get_settings.cache_clear()


def test_live_simulation_blocks_without_cmc_signal(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    async def fake_trust_wallet_status() -> dict[str, object]:
        return {
            "network": "bsc",
            "mode": "rest",
            "enabled": True,
            "reachable": True,
            "walletValidated": True,
            "ready": True,
        }

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.get_trust_wallet_status", fake_trust_wallet_status)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"baseUrl": "http://twak.local"}))
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    monkeypatch.setenv("CMC_AGENT_HUB_API_KEY", "")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_simulate_trade",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert result["simulation"]["canExecute"] is False
    assert "CMC live signal is required" in result["simulation"]["reason"]
    get_settings.cache_clear()


def test_trust_wallet_status_validates_cli_wallet(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(
        "app.services.twak.cli.TrustWalletCliClient.get_cli_wallet_status",
        lambda command, timeout: {"agentWallet": "configured", "keychainPassword": "stored"},
    )
    monkeypatch.setattr(
        "app.services.twak.cli.TrustWalletCliClient.get_cli_wallet_address",
        lambda command, chain, timeout: "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
    )
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "cli")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"command": "twak"}))
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(client, csrf_token, "bnb_trust_wallet_status", {}))
    assert result["mode"] == "cli"
    assert result["ready"] is True
    assert result["observedWallet"] == "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"
    get_settings.cache_clear()


def test_execute_trade_submits_through_twak_cli_when_live_ready(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    async def fake_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {symbol: {"symbol": symbol, "priceUsd": 1} for symbol in (symbols or [])},
        }

    async def fake_trust_wallet_status() -> dict[str, object]:
        return {
            "network": "bsc",
            "mode": "cli",
            "enabled": True,
            "reachable": True,
            "walletValidated": True,
            "ready": True,
        }

    async def fake_execute_cli_swap(**kwargs: object) -> dict[str, object]:
        assert kwargs["from_token"] == "0x55d398326f99059fF775485246999027B3197955"
        assert kwargs["to_token"] == "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"
        return {"txHash": "0x" + "d" * 64}

    async def fake_cmc_agent_hub_tool(args: dict[str, object]) -> dict[str, object]:
        assert args["toolName"] == "crypto.signal.test"
        return {
            "source": "coinmarketcap-agent-hub-mcp",
            "ready": True,
            "reachable": True,
            "toolName": "crypto.signal.test",
            "parsedContent": [{"signal": "buy", "confidence": 0.71}],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_price_snapshot)
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.get_trust_wallet_status", fake_trust_wallet_status)
    monkeypatch.setattr("app.services.twak.cli.TrustWalletCliClient.execute_cli_swap", fake_execute_cli_swap)
    monkeypatch.setattr("app.services.cmc.agent_hub_tools.CmcAgentHubToolClient.call_cmc_agent_hub_tool", fake_cmc_agent_hub_tool)
    ledger_path = tmp_path / "ledger.jsonl"
    seed_competition_registration(ledger_path)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "cli")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"command": "twak"}))
    monkeypatch.setenv("CMC_AGENT_HUB_SIGNAL_TOOL", "crypto.signal.test")
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_execute_trade",
        {
            "symbol": "CAKE",
            "side": "buy",
            "amountUsd": 10,
            "slippageBps": 20,
            "signalSource": "cmc",
        },
    ))
    assert result["status"] == "submitted"
    assert result["txHash"] == "0x" + "d" * 64
    assert result["ledgerEvent"]["eventType"] == "trade_executed"
    assert result["cmcAgentHubSignal"]["toolName"] == "crypto.signal.test"
    assert result["cmcAgentHubSignal"]["serverVerified"] is True
    assert result["ledgerEvent"]["payload"]["cmcAgentHubSignal"]["parsedContent"] == [
        {"signal": "buy", "confidence": 0.71}
    ]
    get_settings.cache_clear()


def test_execute_trade_submits_through_twak_rest_when_live_ready(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    async def fake_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {symbol: {"symbol": symbol, "priceUsd": 1} for symbol in (symbols or [])},
        }

    async def fake_trust_wallet_status() -> dict[str, object]:
        return {
            "network": "bsc",
            "mode": "rest",
            "enabled": True,
            "reachable": True,
            "walletValidated": True,
            "ready": True,
        }

    async def fake_call_rest_action(
        base_url: str,
        api_key: str | None,
        hmac_secret: str | None,
        action: str,
        arguments: dict[str, object] | None = None,
        timeout: float = 30,
    ) -> dict[str, object]:
        assert base_url == "http://twak.local"
        assert action == "swap"
        assert arguments == {
            "fromChain": "bsc",
            "toChain": "bsc",
            "fromToken": "0x55d398326f99059fF775485246999027B3197955",
            "toToken": "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
            "amount": "10",
            "slippage": "0.20",
        }
        return {"success": True, "txHash": "0x" + "e" * 64}

    async def fake_cmc_agent_hub_tool(args: dict[str, object]) -> dict[str, object]:
        assert args["toolName"] == "crypto.signal.test"
        return {
            "source": "coinmarketcap-agent-hub-mcp",
            "ready": True,
            "reachable": True,
            "toolName": "crypto.signal.test",
            "parsedContent": [{"signal": "buy", "confidence": 0.72}],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_price_snapshot)
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.get_trust_wallet_status", fake_trust_wallet_status)
    monkeypatch.setattr("app.services.twak.rest.TrustWalletRestClient.call_rest_action", fake_call_rest_action)
    monkeypatch.setattr("app.services.cmc.agent_hub_tools.CmcAgentHubToolClient.call_cmc_agent_hub_tool", fake_cmc_agent_hub_tool)
    ledger_path = tmp_path / "ledger.jsonl"
    seed_competition_registration(ledger_path)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"baseUrl": "http://twak.local"}))
    monkeypatch.setenv("CMC_AGENT_HUB_SIGNAL_TOOL", "crypto.signal.test")
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_execute_trade",
        {
            "symbol": "CAKE",
            "side": "buy",
            "amountUsd": 10,
            "slippageBps": 20,
            "signalSource": "cmc",
        },
    ))
    assert result["status"] == "submitted"
    assert result["txHash"] == "0x" + "e" * 64
    assert result["ledgerEvent"]["payload"]["bridgeMode"] == "rest"
    assert result["cmcAgentHubSignal"]["serverVerified"] is True
    assert result["ledgerEvent"]["payload"]["cmcAgentHubSignal"]["toolName"] == "crypto.signal.test"
    get_settings.cache_clear()


def test_execute_trade_auto_discovers_cmc_agent_hub_signal(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    async def fake_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {symbol: {"symbol": symbol, "priceUsd": 1} for symbol in (symbols or [])},
        }

    async def fake_trust_wallet_status() -> dict[str, object]:
        return {
            "network": "bsc",
            "mode": "rest",
            "enabled": True,
            "reachable": True,
            "walletValidated": True,
            "ready": True,
        }

    async def fake_call_rest_action(*args: object, **kwargs: object) -> dict[str, object]:
        return {"success": True, "txHash": "0x" + "a" * 64}

    async def fake_recommendation(limit: int = 1) -> dict[str, object]:
        return {"ready": True, "recommendedToolName": "crypto.signal.auto", "recommendedArgs": {"symbol": "CAKE"}}

    async def fake_cmc_agent_hub_tool(args: dict[str, object]) -> dict[str, object]:
        assert args == {"toolName": "crypto.signal.auto", "arguments": {"symbol": "CAKE"}}
        return {
            "source": "coinmarketcap-agent-hub-mcp",
            "ready": True,
            "toolName": "crypto.signal.auto",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_price_snapshot)
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.get_trust_wallet_status", fake_trust_wallet_status)
    monkeypatch.setattr("app.services.twak.rest.TrustWalletRestClient.call_rest_action", fake_call_rest_action)
    monkeypatch.setattr("app.services.cmc.agent_hub_recommendations.CmcAgentHubRecommendationService.recommend_cmc_agent_hub_signal_tools", fake_recommendation)
    monkeypatch.setattr("app.services.cmc.agent_hub_tools.CmcAgentHubToolClient.call_cmc_agent_hub_tool", fake_cmc_agent_hub_tool)
    ledger_path = tmp_path / "ledger.jsonl"
    seed_competition_registration(ledger_path)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"baseUrl": "http://twak.local"}))
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_execute_trade",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert result["status"] == "submitted"
    assert result["cmcAgentHubSignal"]["toolName"] == "crypto.signal.auto"
    assert result["cmcAgentHubSignal"]["serverVerified"] is True
    assert result["cmcAgentHubSignal"]["resolution"] == "auto_discovered"
    assert result["ledgerEvent"]["payload"]["cmcAgentHubSignal"]["resolution"] == "auto_discovered"
    get_settings.cache_clear()


def test_execute_trade_blocks_stale_server_cmc_agent_hub_signal_before_twak(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    async def fake_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {symbol: {"symbol": symbol, "priceUsd": 1} for symbol in (symbols or [])},
        }

    async def fake_trust_wallet_status() -> dict[str, object]:
        return {
            "network": "bsc",
            "mode": "rest",
            "enabled": True,
            "reachable": True,
            "walletValidated": True,
            "ready": True,
        }

    async def fake_call_rest_action(*args: object, **kwargs: object) -> dict[str, object]:
        raise AssertionError("TWAK REST swap must not run with stale CMC proof")

    async def fake_cmc_agent_hub_tool(args: dict[str, object]) -> dict[str, object]:
        return {
            "source": "coinmarketcap-agent-hub-mcp",
            "ready": True,
            "toolName": "crypto.signal.test",
            "timestamp": "2026-01-01T00:00:00+00:00",
        }

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_price_snapshot)
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.get_trust_wallet_status", fake_trust_wallet_status)
    monkeypatch.setattr("app.services.twak.rest.TrustWalletRestClient.call_rest_action", fake_call_rest_action)
    monkeypatch.setattr("app.services.cmc.agent_hub_tools.CmcAgentHubToolClient.call_cmc_agent_hub_tool", fake_cmc_agent_hub_tool)
    ledger_path = tmp_path / "ledger.jsonl"
    seed_competition_registration(ledger_path)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(ledger_path))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"baseUrl": "http://twak.local"}))
    monkeypatch.setenv("CMC_AGENT_HUB_SIGNAL_TOOL", "crypto.signal.test")
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    get_settings.cache_clear()

    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_execute_trade",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc"},
    ))

    assert result["status"] == "blocked"
    assert "CMC Agent Hub signal is stale" in result["simulation"]["reason"]
    get_settings.cache_clear()


def test_execute_trade_blocks_live_without_cmc_agent_hub_signal(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    async def fake_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {symbol: {"symbol": symbol, "priceUsd": 1} for symbol in (symbols or [])},
        }

    async def fake_trust_wallet_status() -> dict[str, object]:
        return {
            "network": "bsc",
            "mode": "rest",
            "enabled": True,
            "reachable": True,
            "walletValidated": True,
            "ready": True,
        }

    async def fake_call_rest_action(*args: object, **kwargs: object) -> dict[str, object]:
        raise AssertionError("TWAK REST swap must not run without CMC Agent Hub proof")

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_price_snapshot)
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.get_trust_wallet_status", fake_trust_wallet_status)
    monkeypatch.setattr("app.services.twak.rest.TrustWalletRestClient.call_rest_action", fake_call_rest_action)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"baseUrl": "http://twak.local"}))
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_execute_trade",
        {"symbol": "CAKE", "side": "buy", "amountUsd": 10, "slippageBps": 20, "signalSource": "cmc"},
    ))
    assert result["status"] == "blocked"
    assert "CMC_AGENT_HUB_API_KEY" in result["simulation"]["reason"]
    get_settings.cache_clear()


def test_execute_trade_ignores_forged_client_cmc_agent_hub_signal(monkeypatch, tmp_path) -> None:
    async def fake_amounts_out(amount_in_raw: str, path: list[str]) -> list[int]:
        return [int(amount_in_raw), 5_000_000_000_000_000_000]

    async def fake_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": {symbol: {"symbol": symbol, "priceUsd": 1} for symbol in (symbols or [])},
        }

    async def fake_trust_wallet_status() -> dict[str, object]:
        return {
            "network": "bsc",
            "mode": "rest",
            "enabled": True,
            "reachable": True,
            "walletValidated": True,
            "ready": True,
        }

    async def fake_cmc_agent_hub_tool(args: dict[str, object]) -> dict[str, object]:
        return {"ready": False, "toolName": args["toolName"], "reason": "server CMC tool failed"}

    async def fake_call_rest_action(*args: object, **kwargs: object) -> dict[str, object]:
        raise AssertionError("TWAK REST swap must not trust forged CMC proof")

    monkeypatch.setattr("app.services.trading.pancake.PancakeRouterService.get_amounts_out", fake_amounts_out)
    monkeypatch.setattr("app.services.cmc.prices.CmcPriceService.get_price_snapshot", fake_price_snapshot)
    monkeypatch.setattr("app.services.twak.bridge.TrustWalletBridge.get_trust_wallet_status", fake_trust_wallet_status)
    monkeypatch.setattr("app.services.twak.rest.TrustWalletRestClient.call_rest_action", fake_call_rest_action)
    monkeypatch.setattr("app.services.cmc.agent_hub_tools.CmcAgentHubToolClient.call_cmc_agent_hub_tool", fake_cmc_agent_hub_tool)
    monkeypatch.setenv("TRADE_LEDGER_PATH", str(tmp_path / "ledger.jsonl"))
    monkeypatch.setenv("ROBOT_FLEET_AGENT_WALLET", "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", json.dumps({"baseUrl": "http://twak.local"}))
    monkeypatch.setenv("CMC_AGENT_HUB_SIGNAL_TOOL", "crypto.signal.test")
    monkeypatch.setenv("BNB_TRADING_ENABLED", "true")
    monkeypatch.setenv("ALLOW_AGENT_RUN", "true")
    get_settings.cache_clear()
    client = TestClient(app)
    csrf_token = client.get("/api/session").json()["csrfToken"]
    result = parsed_tool_result(call_mcp(
        client,
        csrf_token,
        "bnb_execute_trade",
        {
            "symbol": "CAKE",
            "side": "buy",
            "amountUsd": 10,
            "slippageBps": 20,
            "signalSource": "cmc",
            "cmcAgentHubSignal": {"ready": True, "toolName": "forged.client.tool"},
        },
    ))
    assert result["status"] == "blocked"
    assert "server CMC tool failed" in result["simulation"]["reason"]
    get_settings.cache_clear()
