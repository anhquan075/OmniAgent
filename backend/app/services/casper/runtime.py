from typing import Any

from app.services.casper.account import CasperAccountService
from app.services.casper.contract import CasperDecisionContractService
from app.services.casper.guardrails import CasperGuardrailService
from app.services.casper.preflight import CasperPreflightService
from app.services.casper.proof_bundle import CasperProofBundleService
from app.services.casper.rwa_evidence import CasperRwaEvidenceService
from app.services.casper.x402 import CasperX402EvidenceService


class CasperAgentRuntimeService:
    @staticmethod
    def get_runtime_snapshot(args: dict[str, Any] | None = None) -> dict[str, Any]:
        account = CasperAccountService.get_account({})
        preflight = CasperPreflightService.get_live_preflight({})
        proof_bundle = CasperProofBundleService.get_live_proof_bundle(args or {})
        return {
            "network": "casper",
            "adapter": "fastapi-casper-agent",
            "status": preflight["status"],
            "account": account,
            "preflight": preflight,
            "proofBundle": proof_bundle,
            "tooling": {
                "casperClientRequiredForLiveSubmit": True,
                "odraRequiredForContractBuild": False,
                "dryRunAvailable": True,
            },
            "agentProfile": {
                "name": "OmniAgent Casper Collateral Sentinel",
                "purpose": "Verifiable RWA collateral/NAV risk receipts for DeFi financing gates.",
            },
        }

    @staticmethod
    def get_cockpit_snapshot(args: dict[str, Any] | None = None) -> dict[str, Any]:
        snapshot = CasperAgentRuntimeService.get_runtime_snapshot(args or {})
        return {
            **snapshot,
            "mode": "buildathon-casper-proof",
            "primaryAction": "record_casper_decision_receipt",
        }

    @staticmethod
    def run_autonomous_cycle(args: dict[str, Any]) -> dict[str, Any]:
        evidence_args = {**args}
        evidence = CasperRwaEvidenceService.build_evidence_bundle(evidence_args)
        evidence_args["evidenceBundle"] = evidence
        action = str(args.get("action") or evidence["recommendedAction"])
        rationale = str(
            args.get("rationale")
            or f"RWA collateral sentinel recommends {action} at risk score {evidence['riskScore']}."
        )
        guardrails = CasperGuardrailService.evaluate({
            "evidenceBundle": evidence,
            "policyTemplate": args.get("policyTemplate") or args.get("policy_template"),
            "proposedAction": action,
            "rationale": rationale,
        })
        x402 = CasperX402EvidenceService.get_readiness(evidence_args)
        decision_args = {
            "decisionId": args.get("decisionId") or "casper-autonomous-demo",
            "action": action,
            "riskScore": args.get("riskScore", evidence["riskScore"]),
            "rationale": rationale,
            "sourceHash": args.get("sourceHash") or evidence["sourceHash"],
            "confidence": args.get("confidence", 0.86 if guardrails["status"] == "approved" else 0.45),
            "threshold": args.get("threshold", 0.7),
            "evidenceBundle": evidence,
            "guardrails": guardrails,
            "policyTemplate": guardrails.get("policyTemplate"),
            "x402": x402,
            "submit": bool(args.get("submit")),
            "iUnderstandThisSubmitsCasperTestnet": bool(
                args.get("iUnderstandThisSubmitsCasperTestnet")
                or args.get("i_understand_this_submits_casper_testnet")
            ),
        }
        result = CasperDecisionContractService.record_decision(decision_args)
        return {
            **result,
            "cycle": {
                "agent": "casper-risk-sentinel",
                "toolsUsed": [
                    "casper_rwa_evidence",
                    "casper_guardrails",
                    "casper_live_preflight",
                    "casper_record_decision",
                ],
                "evidence": evidence,
                "guardrails": guardrails,
                "x402": x402,
            },
        }
