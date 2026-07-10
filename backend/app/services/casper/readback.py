from datetime import datetime, timezone
from typing import Any

from app.core.settings import get_settings
from app.services.casper.cycle_context import cycle_payload
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.receipt import CasperDecisionReceiptService
from app.services.casper.submitter import CasperCliSubmitter
from app.services.casper.submission_guard import CasperSubmissionGuard


class CasperReadbackService:
    @staticmethod
    def record_readback(args: dict[str, Any]) -> dict[str, Any]:
        target_event = CasperReadbackService.target_event(args)
        decision = CasperReadbackService.decision_from_event(target_event)
        expected = str(decision.get("proofDigest") or "")
        deploy_hash = str(
            args.get("deployHash")
            or args.get("deploy_hash")
            or args.get("transactionHash")
            or args.get("transaction_hash")
            or decision.get("deployHash")
            or decision.get("transactionHash")
            or ""
        )
        hard_blockers = CasperReadbackService.input_blockers(decision, expected, deploy_hash)
        deploy_status: dict[str, Any] = {}
        chain_readback: dict[str, Any] = {}
        receipt_readback: dict[str, Any] = {}
        observed = ""
        observed_receipt = ""
        expected_receipt = CasperDecisionReceiptService.receipt_value(decision) if decision else ""
        if not hard_blockers:
            if CasperCliSubmitter.is_client_available():
                deploy_status = CasperCliSubmitter.get_transaction_status(deploy_hash)
                hard_blockers.extend(deploy_status.get("hardBlockers") or [])
            else:
                deploy_status = {
                    "status": "not_checked",
                    "source": "casper_json_rpc_readback",
                    "hardBlockers": [],
                }
        if not hard_blockers:
            chain_readback = CasperCliSubmitter.query_latest_proof_digest()
            hard_blockers.extend(chain_readback.get("hardBlockers") or [])
            observed = str(chain_readback.get("proofDigest") or "")
        if not hard_blockers and observed != expected:
            hard_blockers.append(CasperReadbackService.blocker(expected, observed))
        if not hard_blockers and expected_receipt:
            receipt_readback = CasperCliSubmitter.query_decision_receipt(str(decision.get("decisionId")))
            hard_blockers.extend(receipt_readback.get("hardBlockers") or [])
            observed_receipt = str(receipt_readback.get("decisionReceipt") or "")
        if not hard_blockers and expected_receipt and observed_receipt != expected_receipt:
            hard_blockers.append("casper_decision_receipt_mismatch")
        readback = {
            "proofDigest": observed or None,
            "decisionReceipt": observed_receipt or None,
            "receiptVerified": bool(expected_receipt and observed_receipt == expected_receipt),
            "source": chain_readback.get("source", "casper_client_query_global_state"),
            "transactionHash": deploy_hash or None,
            "stateRootHash": chain_readback.get("stateRootHash"),
            "cliCommand": chain_readback.get("cliCommand"),
            "receiptStateRootHash": receipt_readback.get("stateRootHash"),
            "receiptCliCommand": receipt_readback.get("cliCommand"),
            "observedAt": datetime.now(timezone.utc).isoformat(),
        }
        verified = bool(expected and observed == expected and readback["receiptVerified"] and not hard_blockers)
        guard_transition: dict[str, Any] = {}
        if verified:
            guard_transition = CasperSubmissionGuard.mark_confirmed(
                CasperSubmissionGuard.idempotency_key(decision)
            )
        updated = {
            **decision,
            "readback": readback,
            "deployStatus": deploy_status,
            "deployConfirmed": deploy_status.get("status") == "confirmed",
        }
        event = CasperDecisionLedger.append_event({
            "eventType": "casper_decision_readback_verified" if verified else "casper_decision_readback_blocked",
            "action": str(updated.get("action") or "observe"),
            "payload": {
                "decision": updated,
                "hardBlockers": hard_blockers,
                "readbackVerified": verified,
                "submissionGuardTransition": guard_transition,
                "cycle": CasperReadbackService.readback_cycle(args, target_event),
            },
        })
        return {
            "network": "casper",
            "status": "verified" if verified else "blocked",
            "verified": verified,
            "decision": updated,
            "readback": readback,
            "expectedProofDigest": expected or None,
            "observedProofDigest": observed or None,
            "hardBlockers": hard_blockers,
            "submissionGuardTransition": guard_transition,
            "ledgerEvent": event,
        }

    @staticmethod
    def target_decision(args: dict[str, Any]) -> dict[str, Any]:
        return CasperReadbackService.decision_from_event(CasperReadbackService.target_event(args))

    @staticmethod
    def target_event(args: dict[str, Any]) -> dict[str, Any]:
        decision_id = str(args.get("decisionId") or args.get("decision_id") or "")
        requested_context = args.get("cycleContext")
        requested_cycle_id = str(
            requested_context.get("cycleId")
            if isinstance(requested_context, dict)
            else ""
        )
        deploy_hash = str(
            args.get("deployHash")
            or args.get("deploy_hash")
            or args.get("transactionHash")
            or args.get("transaction_hash")
            or ""
        )
        ledger = CasperDecisionLedger.get_ledger_summary(
            limit=get_settings().casper_ledger_max_events
        )
        for event in ledger["events"]:
            payload = event.get("payload") if isinstance(event, dict) else None
            decision = payload.get("decision") if isinstance(payload, dict) else None
            if isinstance(decision, dict):
                cycle = payload.get("cycle") if isinstance(payload, dict) else None
                context = cycle.get("cycleContext") if isinstance(cycle, dict) else None
                known_cycle_id = str(
                    context.get("cycleId") if isinstance(context, dict) else ""
                )
                if requested_cycle_id and known_cycle_id != requested_cycle_id:
                    continue
                if decision_id and str(decision.get("decisionId")) != decision_id:
                    continue
                known_hashes = {
                    str(decision.get("deployHash") or ""),
                    str(decision.get("transactionHash") or ""),
                } - {""}
                if deploy_hash and known_hashes and deploy_hash not in known_hashes:
                    continue
                if deploy_hash and not known_hashes:
                    if str(event.get("eventType") or "") != "casper_decision_submission_outcome_unknown":
                        continue
                return event
        return {}

    @staticmethod
    def decision_from_event(event: dict[str, Any]) -> dict[str, Any]:
        payload = event.get("payload") if isinstance(event, dict) else None
        decision = payload.get("decision") if isinstance(payload, dict) else None
        return dict(decision) if isinstance(decision, dict) else {}

    @staticmethod
    def readback_cycle(args: dict[str, Any], target_event: dict[str, Any]) -> dict[str, Any]:
        requested = args.get("cycleContext")
        payload = target_event.get("payload") if isinstance(target_event, dict) else None
        target_cycle = payload.get("cycle") if isinstance(payload, dict) else None
        target_context = target_cycle.get("cycleContext") if isinstance(target_cycle, dict) else None
        context = requested if isinstance(requested, dict) and requested.get("cycleId") else target_context
        if not isinstance(context, dict) or not context.get("cycleId"):
            return {}
        tools = target_cycle.get("toolsUsed") if isinstance(target_cycle, dict) else []
        tools_used = [str(tool) for tool in tools if isinstance(tool, str)]
        tools_used.append("casper_record_readback")
        return cycle_payload(context, tools_used)

    @staticmethod
    def input_blockers(decision: dict[str, Any], expected: str, deploy_hash: str) -> list[str]:
        blockers: list[str] = []
        if not decision:
            blockers.append("casper_decision_missing")
        if not expected:
            blockers.append("casper_readback_expected_digest_missing")
        if not deploy_hash:
            blockers.append("casper_deploy_hash_missing")
        if not get_settings().casper_decision_contract_hash:
            blockers.append("casper_decision_contract_hash_missing")
        return blockers

    @staticmethod
    def blocker(expected: str, observed: str) -> str:
        if not expected:
            return "casper_readback_expected_digest_missing"
        if not observed:
            return "casper_readback_missing"
        return "casper_readback_digest_mismatch"
