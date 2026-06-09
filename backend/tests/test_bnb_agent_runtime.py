from app.services.agent.runtime_snapshot import BnbAgentRuntimeService
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
    assert result["agentProfile"]["agentUriGenerated"] is True  # type: ignore[index]
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
