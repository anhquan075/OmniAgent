from datetime import datetime, timezone

from app.services.casper.contract import CasperDecisionContractService
from app.services.casper.runtime import CasperAgentRuntimeService
from app.services.mcp.tools import McpToolRegistry


def test_casper_runtime_snapshot_reports_fail_closed_state() -> None:
    snapshot = CasperAgentRuntimeService.get_runtime_snapshot({"limit": 5})

    assert snapshot["network"] == "casper"
    assert snapshot["status"] == "blocked"
    assert snapshot["account"]["configured"] is False
    assert snapshot["preflight"]["liveSubmitEnabled"] is False
    assert "casper_account_missing" in snapshot["preflight"]["hardBlockers"]
    assert snapshot["proofBundle"]["status"] == "blocked"
    assert snapshot["tooling"]["odraRequiredForContractBuild"] is False


def test_public_tool_listing_hides_casper_write_tools() -> None:
    tool_names = {tool["name"] for tool in McpToolRegistry.list_tools(operator=False)}

    assert "casper_get_account" in tool_names
    assert "casper_live_preflight" in tool_names
    assert "casper_record_decision" not in tool_names
    assert "casper_record_readback" not in tool_names
    assert "casper_run_autonomous_cycle" not in tool_names


def test_autonomous_cycle_forwards_live_submit_acknowledgement(monkeypatch) -> None:
    captured: list[dict[str, object]] = []

    def fake_record_decision(args: dict[str, object]) -> dict[str, object]:
        captured.append(args)
        return {"network": "casper", "status": "blocked", "submitted": False}

    monkeypatch.setattr(CasperDecisionContractService, "record_decision", fake_record_decision)

    CasperAgentRuntimeService.run_autonomous_cycle(
        {
            "submit": True,
            "iUnderstandThisSubmitsCasperTestnet": True,
        }
    )

    assert captured[-1]["submit"] is True
    assert captured[-1]["iUnderstandThisSubmitsCasperTestnet"] is True


def test_autonomous_cycle_without_evidence_fails_closed() -> None:
    result = CasperAgentRuntimeService.run_autonomous_cycle({"decisionId": "missing-evidence"})

    evidence = result["decision"]["evidenceBundle"]
    assert evidence["status"] == "blocked"
    assert evidence["recommendedAction"] == "block"
    assert "rwa_evidence_missing" in evidence["hardBlockers"]
    assert result["decision"]["policyGate"] == "blocked"


def test_autonomous_cycle_builds_rwa_guardrail_receipt(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    result = CasperAgentRuntimeService.run_autonomous_cycle(
        {
            "decisionId": "rwa-cycle-001",
            "evidence": [
                {
                    "id": "treasury-yield-10y",
                    "label": "US 10Y Treasury yield",
                    "url": "https://home.treasury.gov/resource-center/data-chart-center/interest-rates",
                    "observedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                    "observedValue": 4.82,
                    "threshold": 4.5,
                    "unit": "percent",
                }
            ],
        }
    )

    assert result["network"] == "casper"
    assert result["decision"]["decisionId"] == "rwa-cycle-001"
    assert result["decision"]["evidenceBundle"]["status"] == "ready"
    assert result["decision"]["guardrails"]["guardrailHash"].startswith("sha256:")
    assert result["decision"]["sourceHash"] == result["decision"]["evidenceBundle"]["sourceHash"]
    assert result["decision"]["x402"]["status"] == "unavailable"
    assert result["cycle"]["toolsUsed"] == [
        "casper_rwa_evidence",
        "casper_guardrails",
        "casper_live_preflight",
        "casper_record_decision",
    ]
