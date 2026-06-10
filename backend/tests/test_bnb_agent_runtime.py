from app.services.agent.runtime_snapshot import BnbAgentRuntimeService
from app.services.agent.ledger_memory import LedgerMemoryService
from app.services.agent.sdk_runtime import BnbAgentSdkRuntimeService
from app.services.mcp.tools import McpToolRegistry


def cockpit_fixture() -> dict[str, object]:
    return {
        "wallet": {"walletAddress": "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25"},
        "sdkStatus": {
            "ready": True,
            "installed": True,
            "version": "0.3.4",
            "registryAddress": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
            "registrationEnabled": False,
            "privateKeyConfigured": False,
            "walletPasswordConfigured": False,
        },
        "twakStatus": {"ready": True},
        "prices": {"configured": True, "reachable": True},
        "ledger": {
            "events": [
                {
                    "eventType": "trade_blocked",
                    "tradeIntentId": "intent-1",
                    "createdAt": "2026-06-09T00:00:00+00:00",
                    "payload": {"reason": "router quote missing", "status": "guarded"},
                },
                {
                    "eventType": "risk_checked",
                    "tradeIntentId": "intent-1",
                    "createdAt": "2026-06-09T00:01:00+00:00",
                    "payload": {"approved": True},
                },
            ],
            "dailyCompliance": {"progress": "0/7"},
            "pnl": {
                "totalReturnPct": 1.25,
                "maxDrawdownPct": 2.5,
                "registrationPeriod": {"source": "competition_registered", "totalReturnPct": 1.25},
            },
        },
    }


def test_runtime_snapshot_keeps_bnb_sdk_runtime_and_twak_executor(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.agent.runtime_snapshot.BnbAgentIdentityService._generate_agent_uri",
        lambda _: "data:application/json;base64,omniagent",
    )
    result = BnbAgentRuntimeService.build_runtime_snapshot(
        cockpit_fixture(),
        {"readyForLiveTrade": False, "blockers": [{"name": "quote", "reason": "router quote missing"}]},
        {"status": "guarded", "proofScore": {"score": 6, "maxScore": 8, "hardBlocked": True, "hardBlockers": ["router_quote_valid"]}},
        {"strategyDecision": {"source": "deterministic", "decision": {"action": "hold", "confidence": 0.7, "rationale": "awaiting route"}}},
    )

    assert result["sdkRole"] == "runtime_core"
    assert result["executor"] == "twak"
    assert result["sdkExecutesTrades"] is False
    assert result["sdkRuntime"]["facade"] == "BNBAgent"  # type: ignore[index]
    assert result["sdkRuntime"]["usesOfficialFacade"] is True  # type: ignore[index]
    assert result["sdkRuntime"]["coreRuntime"] is True  # type: ignore[index]
    assert result["sdkRuntime"]["sdkExecutesTrades"] is False  # type: ignore[index]
    assert result["sdkRuntime"]["commerceServer"]["mounted"] is False  # type: ignore[index]
    assert {"erc8004", "erc8183"}.issubset(set(result["sdkRuntime"]["modulesInitialized"]))  # type: ignore[index]
    assert result["sdkRuntime"]["contracts"]["agenticCommerce"] == "0xea4daa3100a767e86fded867729ae7446476eba6"  # type: ignore[index]
    assert result["agentProfile"]["agentUriGenerated"] is True  # type: ignore[index]
    capabilities = {item["name"]: item for item in result["agentProfile"]["capabilities"]}  # type: ignore[index]
    assert capabilities["bnbagent_facade"]["ready"] is True
    assert capabilities["erc8183_protocol"]["ready"] is True
    assert result["identityRegistration"]["liveSubmissionGated"] is True  # type: ignore[index]
    assert result["ledgerMemory"]["latestDecision"]["action"] == "hold"  # type: ignore[index]
    assert "router quote missing" in result["ledgerMemory"]["whyNoTrade"]  # type: ignore[index]
    assert result["strategyResearch"]["mode"] == "advisory_only"  # type: ignore[index]
    assert result["strategyResearch"]["canExecute"] is False  # type: ignore[index]
    assert result["backtestRiskReport"]["runtimeImported"] is False  # type: ignore[index]


def test_runtime_mcp_tools_are_listed_without_replacing_execution_tools() -> None:
    tool_names = {tool["name"] for tool in McpToolRegistry.list_tools()}

    assert "bnb_agent_runtime_snapshot" in tool_names
    assert "bnb_ledger_memory" in tool_names
    assert "bnb_strategy_research" in tool_names
    assert "bnb_backtest_report" in tool_names
    assert "bnb_execute_trade" in tool_names


def test_ledger_memory_downgrades_execute_intent_when_live_gates_are_guarded() -> None:
    memory = LedgerMemoryService.build(
        {
            "events": [
                {
                    "eventType": "trade_blocked",
                    "action": "execute_trade",
                    "payload": {
                        "reason": (
                            "agent wallet is not configured; Agent wallet address is not configured; "
                            "BNB live trading is disabled; ALLOW_AGENT_RUN is false; "
                            "emergency_pause_enabled; cmc_signal_required; router-backed transaction is required"
                        ),
                        "status": "guarded",
                    },
                },
            ],
        },
        {"readyForLiveTrade": True, "blockers": []},
        {"proofScore": {"hardBlocked": True, "hardBlockers": ["funded_route", "emergency_pause"]}},
        {"strategyDecision": {"decision": {"action": "execute_trade", "rationale": "Live preflight passed all deterministic backend gates."}}},
    )

    assert memory["latestDecision"]["action"] == "safety_hold"  # type: ignore[index]
    assert memory["latestDecision"]["status"] == "guarded"  # type: ignore[index]
    assert memory["whyTrade"] == ["No executable trade thesis while live safety gates are guarded."]
    assert "Live preflight passed all deterministic backend gates." not in memory["whyTrade"]  # type: ignore[operator]
    assert memory["whyNoTrade"][:4] == [  # type: ignore[index]
        "Router-backed funded route is not ready.",
        "Emergency pause is enabled.",
        "Agent wallet is not configured.",
        "Agent wallet address is not configured.",
    ]


def test_ledger_memory_ignores_synthetic_intent_test_events() -> None:
    memory = LedgerMemoryService.build(
        {
            "events": [
                {
                    "eventType": "trade_blocked",
                    "tradeIntentId": "intent-test",
                    "payload": {"reason": "agent wallet is not configured"},
                },
                {
                    "eventType": "trade_blocked",
                    "tradeIntentId": "intent-test",
                    "payload": {"reason": "agent wallet is not configured"},
                },
                {
                    "eventType": "autonomous_cycle_completed",
                    "tradeIntentId": "intent-live",
                    "payload": {"status": "blocked"},
                },
                {
                    "eventType": "trade_blocked",
                    "tradeIntentId": "intent-live",
                    "payload": {"reason": "emergency_pause_enabled"},
                },
            ],
        },
        {"readyForLiveTrade": False, "blockers": []},
        {"proofScore": {"hardBlocked": True, "hardBlockers": ["emergency_pause"]}},
        None,
    )

    episodes = memory["memoryLayers"]["episodic"]  # type: ignore[index]
    assert {item["tradeIntentId"] for item in episodes} == {"intent-live"}  # type: ignore[union-attr]
    assert "Agent wallet is not configured." not in memory["whyNoTrade"]  # type: ignore[operator]
    assert "Emergency pause is enabled." in memory["whyNoTrade"]  # type: ignore[operator]


def test_ledger_memory_filters_proof_route_blocker_when_preflight_clears_route() -> None:
    memory = LedgerMemoryService.build(
        {"events": []},
        {
            "readyForLiveTrade": True,
            "blockers": [],
            "checks": [{"name": "funded_route", "ok": True}],
        },
        {"proofScore": {"hardBlocked": True, "hardBlockers": ["funded_route", "emergency_pause"]}},
        {"strategyDecision": {"decision": {"action": "buy", "rationale": "route checked"}}},
    )

    assert "Router-backed funded route is not ready." not in memory["whyNoTrade"]  # type: ignore[operator]
    assert memory["whyNoTrade"] == ["Emergency pause is enabled."]
    assert memory["latestDecision"]["reason"] == "Emergency pause is enabled."  # type: ignore[index]


def test_bnbagent_facade_probe_initializes_without_signer_material() -> None:
    result = BnbAgentSdkRuntimeService.get_facade_snapshot(
        "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
        {
            "installed": True,
            "ready": True,
            "version": "0.3.4",
            "registryAddress": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
        },
    )

    assert result["usesOfficialFacade"] is True
    assert result["facadeInitialized"] is True
    assert result["facadeReady"] is True
    assert result["walletProvider"] == "none-read-only"
    assert result["secretMaterialLoaded"] is False
    assert result["modulesRequested"] == ["erc8004", "erc8183"]
    assert {"erc8004", "erc8183"}.issubset(set(result["modulesInitialized"]))  # type: ignore[arg-type]
