from datetime import datetime, timezone
from typing import Any

from app.core.settings import get_settings
from app.services.casper.cycle_context import cycle_payload, normalize_cycle_context
from app.services.casper.cycle_history import CasperCycleHistoryService
from app.services.casper.hashing import sha256_json, sha256_text
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.payload_policy import resolve_policy_gate
from app.services.casper.preflight import CasperPreflightService
from app.services.casper.receipt import CasperDecisionReceiptService
from app.services.casper.submitter import CasperCliSubmitter
from app.services.casper.submission_guard import CasperSubmissionGuard


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
        submit = bool(args.get("submit"))
        cycle_context = normalize_cycle_context(args.get("cycleContext"), fallback_origin="manual")
        tools_used = args.get("toolsUsed") if isinstance(args.get("toolsUsed"), list) else [
            "casper_live_preflight",
            "casper_record_decision",
        ]
        decision = CasperDecisionContractService.build_decision_payload(args)
        requested_decision_id = decision["decisionId"]
        if submit:
            semantic_id = CasperSubmissionGuard.semantic_decision_id(decision)
            if requested_decision_id != semantic_id:
                decision = CasperDecisionContractService.build_decision_payload({
                    **args,
                    "decisionId": semantic_id,
                    "decision_id": semantic_id,
                    "receiptId": semantic_id,
                })
        preflight = CasperPreflightService.get_live_preflight({})
        live_flag = bool(
            args.get("iUnderstandThisSubmitsCasperTestnet")
            or args.get("i_understand_this_submits_casper_testnet")
        )
        blockers = list(preflight["hardBlockers"])
        if submit and not live_flag:
            blockers.append("casper_live_submit_flag_missing")
        if submit and decision.get("policyGate") != "approved":
            blockers.append("casper_policy_gate_blocked")
        if submit:
            blockers.extend(CasperDecisionContractService.live_payload_blockers(decision))
        submit_result: dict[str, Any] = {}
        chain_guard: dict[str, Any] = {
            "allowed": False,
            "status": "not_evaluated",
            "hardBlockers": [],
            "metadata": {},
        }
        submission_guard: dict[str, Any] = {
            "allowed": False,
            "reserved": False,
            "status": "not_evaluated",
            "hardBlockers": [],
            "metadata": {},
        }
        intent_key = ""
        submitted = False
        event_type = "casper_decision_dry_run"
        if submit and blockers:
            event_type = "casper_decision_live_submit_blocked"
        if submit and not blockers:
            try:
                chain_guard = CasperSubmissionGuard.check_chain_state(decision)
            except Exception:
                chain_guard = {
                    "allowed": False,
                    "status": "blocked",
                    "hardBlockers": ["casper_chain_submission_guard_unavailable"],
                    "metadata": {},
                }
            blockers.extend(chain_guard.get("hardBlockers") or [])
        if submit and not blockers:
            try:
                submission_guard = CasperSubmissionGuard.reserve(decision)
            except Exception:
                submission_guard = {
                    "allowed": False,
                    "reserved": False,
                    "status": "blocked",
                    "hardBlockers": ["casper_submission_guard_unavailable"],
                    "metadata": {},
                }
            blockers.extend(submission_guard.get("hardBlockers") or [])
            intent_key = str(submission_guard.get("idempotencyKey") or "")
        if submit and blockers:
            event_type = "casper_decision_live_submit_blocked"
        if submit and not blockers:
            try:
                submit_result = CasperCliSubmitter.submit_decision(decision)
            except Exception as exc:
                submit_result = {
                    "submitted": False,
                    "status": "outcome_unknown",
                    "outcomeUnknown": True,
                    "hardBlockers": ["casper_cli_submit_outcome_unknown"],
                }
                if intent_key:
                    CasperSubmissionGuard.mark_outcome_unknown(intent_key, str(exc)[:200])
            blockers.extend(submit_result.get("hardBlockers") or [])
            submitted = bool(submit_result.get("submitted"))
            if submitted:
                guard_transition = CasperSubmissionGuard.mark_submitted(
                    intent_key,
                    str(submit_result.get("deployHash") or submit_result.get("transactionHash") or ""),
                )
                submission_guard = {**submission_guard, "transition": guard_transition, "status": "submitted"}
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
            elif submit_result.get("outcomeUnknown"):
                guard_transition = CasperSubmissionGuard.mark_outcome_unknown(
                    intent_key,
                    str((submit_result.get("hardBlockers") or ["unknown"])[0]),
                )
                submission_guard = {**submission_guard, "transition": guard_transition, "status": "outcome_unknown"}
                event_type = "casper_decision_submission_outcome_unknown"
            else:
                guard_transition = CasperSubmissionGuard.mark_failed(
                    intent_key,
                    str((submit_result.get("hardBlockers") or ["submit_failed"])[0]),
                )
                submission_guard = {**submission_guard, "transition": guard_transition, "status": "failed"}
                event_type = "casper_decision_live_submit_failed"
        status = (
            str(submit_result.get("status") or "submitted")
            if submitted
            else (
                "outcome_unknown"
                if submit_result.get("outcomeUnknown")
                else ("blocked" if submit else ("dry_run_blocked" if blockers else "dry_run"))
            )
        )
        blockers = list(dict.fromkeys(blockers))
        event = CasperDecisionContractService.append_decision_event(
            decision,
            blockers,
            submitted,
            event_type,
            submit_result,
            submission_guard,
            preflight,
            cycle_payload(cycle_context, tools_used),
        )
        return {
            "network": "casper",
            "status": status,
            "submitted": submitted,
            "requiresLiveFlag": True,
            "requestedDecisionId": requested_decision_id,
            "decision": decision,
            "preflight": preflight,
            "chainSubmissionGuard": chain_guard,
            "submissionGuard": submission_guard,
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
        submission_guard: dict[str, Any] | None = None,
        preflight: dict[str, Any] | None = None,
        cycle: dict[str, Any] | None = None,
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
                "paymentAmountMotes": (submit_result or {}).get("paymentAmountMotes"),
                "submissionGuard": submission_guard or {},
                "preflight": CasperCycleHistoryService.sanitize_preflight(preflight),
                "cycle": cycle or {},
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

    @staticmethod
    def live_payload_blockers(decision: dict[str, Any]) -> list[str]:
        settings = get_settings()
        limits = {
            "decisionId": 96,
            "action": 48,
            "proofDigest": 96,
            "rationaleHash": 96,
            "sourceHash": 96,
            "timestamp": 48,
            "policyGate": 32,
            "agentAccountHash": 96,
            "guardrailHash": 96,
        }
        if any(len(str(decision.get(field) or "").encode("utf-8")) > limit for field, limit in limits.items()):
            return ["casper_decision_payload_too_large"]
        receipt_value = CasperDecisionReceiptService.receipt_value(decision)
        if len(receipt_value.encode("utf-8")) > settings.casper_live_max_receipt_bytes:
            return ["casper_decision_payload_too_large"]
        return []
