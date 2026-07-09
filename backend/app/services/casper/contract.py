from datetime import datetime, timezone
from typing import Any

from app.core.settings import get_settings
from app.services.casper.hashing import sha256_json, sha256_text
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.payload_policy import resolve_policy_gate
from app.services.casper.preflight import CasperPreflightService
from app.services.casper.receipt import CasperDecisionReceiptService
from app.services.casper.submitter import CasperCliSubmitter


class CasperDecisionContractService:
    @staticmethod
    def build_decision_payload(args: dict[str, Any]) -> dict[str, Any]:
        gate = args.get("materialityGate") if isinstance(args.get("materialityGate"), dict) else {}
        confidence = float(args.get("confidence", gate.get("confidence", 0.0)) or 0.0)
        threshold = float(args.get("threshold", gate.get("threshold", 0.7)) or 0.7)
        rationale = str(args.get("rationale") or "No rationale supplied.")
        evidence = args.get("evidenceBundle") if isinstance(args.get("evidenceBundle"), dict) else {}
        guardrails = args.get("guardrails") if isinstance(args.get("guardrails"), dict) else {}
        source_hash = str(
            args.get("sourceHash")
            or args.get("source_hash")
            or evidence.get("sourceHash")
            or "manual-source"
        )
        policy_gate = resolve_policy_gate(args, evidence, guardrails)
        payload = {
            "network": "casper-testnet",
            "decisionId": str(args.get("decisionId") or args.get("decision_id") or "casper-decision"),
            "receiptId": str(args.get("receiptId") or args.get("decisionId") or args.get("decision_id") or "casper-decision"),
            "action": str(args.get("action") or "hold"),
            "riskScore": max(0, min(100, int(args.get("riskScore", args.get("risk_score", 0)) or 0))),
            "rationaleHash": CasperDecisionContractService.sha256_hex(rationale),
            "rationale": rationale,
            "sourceHash": source_hash,
            "timestamp": str(args.get("timestamp") or datetime.now(timezone.utc).isoformat()),
            "policyGate": policy_gate,
            "agentAccountHash": str(args.get("agentAccountHash") or args.get("agent_account_hash") or ""),
            "guardrailHash": str(
                args.get("guardrailHash")
                or args.get("guardrail_hash")
                or guardrails.get("guardrailHash")
                or ""
            ),
            "materialityGate": {
                "confidence": confidence,
                "threshold": threshold,
                "passed": confidence >= threshold,
            },
        }
        if evidence:
            payload["evidenceBundle"] = evidence
        if guardrails:
            payload["guardrails"] = guardrails
        policy_template = args.get("policyTemplate")
        if isinstance(policy_template, dict):
            payload["policyTemplate"] = policy_template
        if isinstance(args.get("x402"), dict):
            payload["x402"] = args["x402"]
        payload["proofDigest"] = CasperDecisionContractService.proof_digest(payload)
        payload["decisionReceipt"] = CasperDecisionReceiptService.receipt_from_decision(payload)
        return payload

    @staticmethod
    def record_decision(args: dict[str, Any]) -> dict[str, Any]:
        decision = CasperDecisionContractService.build_decision_payload(args)
        preflight = CasperPreflightService.get_live_preflight({})
        submit = bool(args.get("submit"))
        live_flag = bool(
            args.get("iUnderstandThisSubmitsCasperTestnet")
            or args.get("i_understand_this_submits_casper_testnet")
        )
        blockers = list(preflight["hardBlockers"])
        if submit and not live_flag:
            blockers.append("casper_live_submit_flag_missing")
        if submit and decision.get("policyGate") != "approved":
            blockers.append("casper_policy_gate_blocked")
        submit_result: dict[str, Any] = {}
        submitted = False
        event_type = "casper_decision_dry_run"
        if submit and blockers:
            event_type = "casper_decision_live_submit_blocked"
        if submit and not blockers:
            submit_result = CasperCliSubmitter.submit_decision(decision)
            blockers.extend(submit_result.get("hardBlockers") or [])
            submitted = bool(submit_result.get("submitted"))
            if submitted:
                event_type = "casper_decision_submitted"
                decision = {
                    **decision,
                    "deployHash": submit_result.get("deployHash"),
                    "transactionHash": submit_result.get("transactionHash"),
                    "explorerUrl": submit_result.get("explorerUrl"),
                    "transactionExplorerUrl": submit_result.get("transactionExplorerUrl"),
                    "deployConfirmed": False,
                }
                decision["decisionReceipt"] = CasperDecisionReceiptService.receipt_from_decision(decision)
            else:
                event_type = "casper_decision_live_submit_failed"
        status = (
            str(submit_result.get("status") or "submitted")
            if submitted
            else ("blocked" if submit else ("dry_run_blocked" if blockers else "dry_run"))
        )
        event = CasperDecisionContractService.append_decision_event(
            decision,
            blockers,
            submitted,
            event_type,
            submit_result,
        )
        return {
            "network": "casper",
            "status": status,
            "submitted": submitted,
            "requiresLiveFlag": True,
            "decision": decision,
            "preflight": preflight,
            "hardBlockers": blockers,
            "deployHash": submit_result.get("deployHash"),
            "transactionHash": submit_result.get("transactionHash"),
            "contractHash": get_settings().casper_decision_contract_hash or None,
            "contractPackageHash": get_settings().casper_decision_contract_package_hash or None,
            "explorerUrl": submit_result.get("explorerUrl"),
            "transactionExplorerUrl": submit_result.get("transactionExplorerUrl"),
            "cliCommand": submit_result.get("cliCommand"),
            "ledgerEvent": event,
            "decisionReceipt": decision.get("decisionReceipt"),
        }

    @staticmethod
    def get_deploy_status(args: dict[str, Any]) -> dict[str, Any]:
        deploy_hash = str(
            args.get("deployHash")
            or args.get("deploy_hash")
            or args.get("transactionHash")
            or args.get("transaction_hash")
            or ""
        ).strip()
        explorer = get_settings().casper_explorer_url.rstrip("/")
        if deploy_hash and bool(args.get("refresh")):
            status = CasperCliSubmitter.get_transaction_status(deploy_hash)
            return {
                "network": "casper",
                "deployHash": deploy_hash,
                "transactionHash": deploy_hash,
                "status": status["status"],
                "explorerUrl": f"{explorer}/deploy/{deploy_hash}",
                "transactionExplorerUrl": f"{explorer}/transaction/{deploy_hash}",
                "hardBlockers": status["hardBlockers"],
                "cliCommand": status.get("cliCommand"),
            }
        return {
            "network": "casper",
            "deployHash": deploy_hash or None,
            "transactionHash": deploy_hash or None,
            "status": "not_submitted" if not deploy_hash else "unverified",
            "explorerUrl": f"{explorer}/deploy/{deploy_hash}" if deploy_hash else None,
            "transactionExplorerUrl": f"{explorer}/transaction/{deploy_hash}" if deploy_hash else None,
            "hardBlockers": [] if deploy_hash else ["casper_deploy_hash_missing"],
        }

    @staticmethod
    def append_decision_event(
        decision: dict[str, Any],
        blockers: list[str],
        submitted: bool,
        event_type: str,
        submit_result: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return CasperDecisionLedger.append_event({
            "eventType": event_type,
            "action": decision["action"],
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "decision": decision,
                "hardBlockers": blockers,
                "submitted": submitted,
                "submitStatus": (submit_result or {}).get("status"),
            },
        })

    @staticmethod
    def proof_digest(payload: dict[str, Any]) -> str:
        digest_payload = {
            key: value
            for key, value in payload.items()
            if key not in {"proofDigest", "decisionReceipt", "rationale"}
        }
        return sha256_json(digest_payload)

    @staticmethod
    def sha256_hex(value: str) -> str:
        return sha256_text(value)
