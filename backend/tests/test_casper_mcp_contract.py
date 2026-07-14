from app.core.settings import get_settings
from app.services.mcp.tools import McpToolRegistry


CASPER_TOOL_NAMES = {
    "casper_agent_cockpit_snapshot",
    "casper_get_account",
    "casper_runtime_snapshot",
    "casper_live_preflight",
    "casper_run_autonomous_cycle",
    "casper_live_proof_bundle",
    "casper_get_deploy_status",
    "casper_record_decision",
    "casper_record_readback",
}


def test_casper_tools_are_advertised_by_default() -> None:
    tool_names = {tool["name"] for tool in McpToolRegistry.list_tools()}

    assert CASPER_TOOL_NAMES.issubset(tool_names)
    assert CASPER_TOOL_NAMES.issubset(get_settings().allowed_tools)


async def test_casper_live_preflight_fails_closed_without_account() -> None:
    result = await McpToolRegistry.call_tool("casper_live_preflight", {})

    assert result.network == "casper"
    assert result.status == "blocked"
    assert "casper_account_missing" in result.hardBlockers
    assert result.liveSubmitEnabled is False
    assert "path" not in result.account["signer"]


async def test_casper_record_decision_dry_run_returns_receipt_shape(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    get_settings.cache_clear()

    result = await McpToolRegistry.call_tool(
        "casper_record_decision",
        {
            "decisionId": "judge-demo-001",
            "action": "hold",
            "riskScore": 64,
            "rationale": "Materiality threshold not met.",
            "sourceHash": "source-xyz",
            "submit": False,
        },
    )

    assert result.network == "casper"
    assert result.status == "dry_run_blocked"
    assert result.submitted is False
    assert "casper_account_missing" in result.hardBlockers
    assert result.decision["decisionId"] == "judge-demo-001"
    assert result.decision["proofDigest"].startswith("sha256:")
    assert result.ledgerEvent["eventType"] == "casper_decision_dry_run"

    get_settings.cache_clear()


async def test_casper_public_proof_bundle_does_not_expose_filesystem_paths(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    get_settings.cache_clear()

    result = await McpToolRegistry.call_tool("casper_live_proof_bundle", {"limit": 5})

    assert result.network == "casper"
    assert "ledgerPath" not in result.model_dump()
    assert result.ledger["configured"] is True
    assert result.ledger["eventCount"] == 0

    get_settings.cache_clear()
