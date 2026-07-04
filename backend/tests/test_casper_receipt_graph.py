from datetime import datetime, timezone

from app.core.settings import get_settings
from app.services.casper.cli_command import CasperCliCommand
from app.services.casper.contract import CasperDecisionContractService
from app.services.casper.receipt import CasperDecisionReceiptService
from app.services.casper.rwa_evidence import CasperRwaEvidenceService
from app.services.mcp.tools import McpToolRegistry


def evidence_bundle() -> dict[str, object]:
    return CasperRwaEvidenceService.build_evidence_bundle(
        {
            "evidence": [
                {
                    "id": "treasury-yield-10y",
                    "label": "US 10Y Treasury yield",
                    "url": "https://home.treasury.gov/resource-center/data-chart-center/interest-rates",
                    "observedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                    "observedValue": 4.2,
                    "threshold": 4.5,
                    "unit": "percent",
                }
            ]
        }
    )


def test_decision_payload_contains_receipt_graph_fields() -> None:
    evidence = evidence_bundle()
    payload = CasperDecisionContractService.build_decision_payload(
        {
            "decisionId": "receipt-001",
            "action": "hold",
            "riskScore": evidence["riskScore"],
            "rationale": "Treasury yield is under the configured collateral threshold.",
            "evidenceBundle": evidence,
            "guardrails": {"guardrailHash": "sha256:" + "1" * 64},
            "agentAccountHash": "account-hash-demo",
            "confidence": 0.82,
            "threshold": 0.7,
        }
    )

    receipt = payload["decisionReceipt"]
    assert payload["receiptId"] == "receipt-001"
    assert payload["sourceHash"] == evidence["sourceHash"]
    assert payload["policyGate"] == "approved"
    assert payload["guardrailHash"] == "sha256:" + "1" * 64
    assert receipt["decisionId"] == "receipt-001"
    assert receipt["agentAccountHash"] == "account-hash-demo"
    assert receipt["proofDigest"] == payload["proofDigest"]


def test_receipt_service_finds_and_verifies_recorded_decision(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    get_settings.cache_clear()
    result = CasperDecisionContractService.record_decision(
        {
            "decisionId": "receipt-002",
            "action": "hold",
            "riskScore": 22,
            "rationale": "Low risk collateral observation.",
            "sourceHash": "sha256:" + "2" * 64,
        }
    )

    receipt = CasperDecisionReceiptService.get_decision_receipt({"decisionId": "receipt-002"})
    verified = CasperDecisionReceiptService.verify_decision_receipt({"decisionId": "receipt-002"})

    assert receipt["status"] == "found"
    assert receipt["decisionReceipt"]["decisionId"] == "receipt-002"
    assert receipt["decisionReceipt"]["proofDigest"] == result["decision"]["proofDigest"]
    assert verified["verified"] is False
    assert verified["localVerified"] is True
    assert verified["chainVerified"] is False
    assert "casper_decision_receipt_readback_missing" in verified["hardBlockers"]
    assert verified["expectedProofDigest"] == result["decision"]["proofDigest"]

    get_settings.cache_clear()


def test_casper_receipt_tools_are_available_to_operator() -> None:
    tool_names = {tool["name"] for tool in McpToolRegistry.list_tools()}

    assert "casper_get_decision_receipt" in tool_names
    assert "casper_verify_decision_receipt" in tool_names


async def test_casper_get_decision_receipt_mcp_tool(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    get_settings.cache_clear()
    CasperDecisionContractService.record_decision(
        {
            "decisionId": "receipt-003",
            "rationale": "Receipt lookup through MCP.",
            "sourceHash": "sha256:" + "3" * 64,
        }
    )

    result = await McpToolRegistry.call_tool(
        "casper_get_decision_receipt",
        {"decisionId": "receipt-003"},
    )

    assert result.network == "casper"
    assert result.status == "found"
    assert result.decisionReceipt["decisionId"] == "receipt-003"

    get_settings.cache_clear()


def test_casper_submit_command_includes_receipt_graph_session_args() -> None:
    command_args = CasperCliCommand.session_args(
        {
            "decisionId": "receipt-004",
            "action": "hold",
            "proofDigest": "sha256:" + "4" * 64,
            "rationaleHash": "sha256:" + "5" * 64,
            "sourceHash": "sha256:" + "6" * 64,
            "timestamp": "2026-07-02T12:00:00+00:00",
            "riskScore": 10,
            "policyGate": "approved",
            "agentAccountHash": "account-hash-demo",
            "guardrailHash": "sha256:" + "7" * 64,
        }
    )

    joined = " ".join(command_args)
    assert "policy_gate:string='approved'" in joined
    assert "agent_account_hash:string='account-hash-demo'" in joined
    assert f"guardrail_hash:string='sha256:{'7' * 64}'" in joined


def test_receipt_service_verifies_chain_receipt_readback(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CASPER_DECISION_LEDGER_PATH", str(tmp_path / "dashboard-log"))
    get_settings.cache_clear()
    result = CasperDecisionContractService.record_decision(
        {
            "decisionId": "receipt-005",
            "action": "hold",
            "riskScore": 22,
            "rationale": "Low risk collateral observation.",
            "sourceHash": "sha256:" + "8" * 64,
        }
    )
    decision = {
        **result["decision"],
        "readback": {
            "proofDigest": result["decision"]["proofDigest"],
            "decisionReceipt": result["decision"]["decisionReceipt"]["receiptValue"],
            "receiptVerified": True,
            "source": "casper_client_query_global_state",
            "stateRootHash": "a" * 64,
        },
    }
    from app.services.casper.ledger import CasperDecisionLedger

    CasperDecisionLedger.append_event({
        "eventType": "casper_decision_readback_verified",
        "payload": {"decision": decision},
    })

    verified = CasperDecisionReceiptService.verify_decision_receipt({"decisionId": "receipt-005"})

    assert verified["verified"] is True
    assert verified["localVerified"] is True
    assert verified["chainVerified"] is True
    assert verified["hardBlockers"] == []


def test_query_decision_receipt_command_targets_dictionary_item() -> None:
    command = CasperCliCommand.query_decision_receipt_command("a" * 64, "receipt-006")

    assert "get-dictionary-item" in command
    assert "--contract-hash" in command
    assert "--dictionary-name" in command
    assert "decision_receipts" in command
    assert command[-2:] == ["--dictionary-item-key", "receipt-006"]
