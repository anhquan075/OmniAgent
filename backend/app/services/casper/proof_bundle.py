from typing import Any

from app.core.settings import get_settings
from app.services.casper.contract import CasperDecisionContractService
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.preflight import CasperPreflightService
from app.services.casper.receipt import CasperDecisionReceiptService
from app.services.casper.submission_guard import CasperSubmissionGuard
from app.services.casper.trust import CasperTrustService


class CasperProofBundleService:
    @staticmethod
    def get_live_proof_bundle(args: dict[str, Any] | None = None) -> dict[str, Any]:
        options = args or {}
        limit = int(options.get("limit") or 10)
        refresh_status = bool(options.get("refreshStatus") or options.get("refresh_status"))
        preflight = CasperPreflightService.get_live_preflight({})
        ledger = CasperDecisionLedger.get_ledger_summary(
            limit=max(limit, get_settings().casper_ledger_max_events)
        )
        trust_events = ledger["events"][:max(1, limit)]
        latest = CasperProofBundleService.latest_casper_event(ledger["events"])
        decision = CasperProofBundleService.decision_from_event(latest)
        deploy_status = CasperProofBundleService.deploy_status(decision, refresh_status)
        readback = CasperProofBundleService.readback_status(decision)
        blockers = CasperProofBundleService.bundle_blockers(preflight, deploy_status, readback)
        proof_score = CasperProofBundleService.proof_score(preflight, decision, deploy_status, readback, blockers)
        live_verified = (
            not blockers
            and deploy_status.get("status") == "confirmed"
            and readback.get("verified") is True
        )
        return {
            "network": "casper",
            "status": "live_verified" if live_verified else ("blocked" if blockers else "ready_for_live_submit"),
            "preflight": preflight,
            "lifecycle": CasperProofBundleService.lifecycle(decision, deploy_status, readback),
            "latestDecision": decision,
            "decisionReceipt": (
                CasperDecisionReceiptService.receipt_from_decision(decision) if decision else None
            ),
            "deployStatus": deploy_status,
            "readback": readback,
            "proofScore": proof_score,
            "trustSummary": CasperTrustService.get_trust_summary(trust_events),
            "recoveryCandidates": CasperProofBundleService.recovery_candidates(blockers),
            "ledger": {
                "configured": True,
                "eventCount": ledger["eventCount"],
                "latestEventId": (
                    ledger["events"][0].get("eventId") if ledger["events"] else None
                ),
            },
        }

    @staticmethod
    def latest_casper_event(events: object) -> dict[str, Any] | None:
        if not isinstance(events, list):
            return None
        latest_decision_event: dict[str, Any] | None = None
        duplicate_decision_id = ""
        duplicate_blockers = {
            CasperSubmissionGuard.DUPLICATE_BLOCKER,
            CasperSubmissionGuard.CHAIN_DUPLICATE_BLOCKER,
        }
        for event in events:
            if not isinstance(event, dict) or not str(event.get("eventType", "")).startswith("casper_"):
                continue
            payload = event.get("payload")
            decision = payload.get("decision") if isinstance(payload, dict) else None
            if not isinstance(decision, dict) or not decision:
                continue
            if latest_decision_event is None:
                latest_decision_event = event
                blockers = {
                    str(blocker)
                    for blocker in (payload.get("hardBlockers") or [])
                    if isinstance(blocker, str)
                }
                is_duplicate_attempt = bool(
                    str(event.get("eventType") or "") == "casper_decision_live_submit_blocked"
                    and blockers.intersection(duplicate_blockers)
                )
                if not is_duplicate_attempt:
                    return event
                duplicate_decision_id = str(decision.get("decisionId") or "")
                continue
            if str(decision.get("decisionId") or "") != duplicate_decision_id:
                continue
            has_deploy = bool(decision.get("deployHash") or decision.get("transactionHash"))
            has_readback = isinstance(decision.get("readback"), dict) and bool(decision["readback"])
            if has_deploy or has_readback:
                return event
        return latest_decision_event

    @staticmethod
    def decision_from_event(event: dict[str, Any] | None) -> dict[str, Any] | None:
        payload = event.get("payload") if isinstance(event, dict) else None
        decision = payload.get("decision") if isinstance(payload, dict) else None
        return decision if isinstance(decision, dict) else None

    @staticmethod
    def recovery_candidates(blockers: list[str]) -> list[dict[str, str]]:
        mapping = {
            "casper_account_missing": "Configure CASPER_ACCOUNT_PUBLIC_KEY for the funded testnet account.",
            "casper_secret_key_path_missing": "Configure CASPER_SECRET_KEY_PATH outside git.",
            "casper_secret_key_unreadable": "Move the Casper secret key outside git and make it readable.",
            "casper_decision_contract_hash_missing": "Deploy the decision contract and set its hash.",
            "casper_decision_contract_package_hash_missing": "Set the Casper contract package hash.",
            "casper_live_submit_disabled": "Enable CASPER_LIVE_SUBMIT_ENABLED only for the live proof window.",
            "casper_client_missing": "Install casper-client or set CASPER_CLIENT_PATH to the Casper CLI binary.",
            "casper_account_balance_insufficient": "Fund the configured Casper Testnet account before live submit.",
            "casper_transaction_wasm_path_missing": "Set CASPER_TRANSACTION_WASM_PATH to the compiled decision receipt Wasm.",
            "casper_transaction_wasm_unreadable": "Make the configured Casper transaction Wasm readable.",
            "casper_deploy_hash_missing": "Run a dry-run first, then submit once with the explicit Casper testnet flag.",
            "casper_deploy_not_confirmed": "Poll the deploy status until Casper Testnet confirms the receipt.",
            "casper_readback_missing": "Query Casper contract state with casper_record_readback.",
            "casper_readback_digest_mismatch": "Re-read the contract and regenerate the local proof artifact before resubmission.",
            "casper_decision_receipt_readback_missing": "Query the per-decision receipt from Casper dictionary state.",
            "casper_decision_receipt_mismatch": "Re-read the decision receipt and compare it with the local receipt value.",
            "casper_policy_gate_blocked": "Fix the evidence or guardrail blocker before live submit.",
            "rwa_evidence_missing": "Attach real RWA/DeFi evidence with URL, value, threshold, and observation time.",
            "rwa_evidence_stale": "Refresh the RWA/DeFi observation before recording a receipt.",
            "x402_evidence_endpoint_missing": "Configure a real x402 evidence endpoint or leave x402 marked unavailable.",
        }
        return [
            {"blocker": blocker, "action": mapping.get(blocker, "Resolve Casper live-submit blocker.")}
            for blocker in blockers
        ]

    @staticmethod
    def deploy_status(decision: dict[str, Any] | None, refresh_status: bool = False) -> dict[str, Any]:
        if not decision:
            return CasperDecisionContractService.get_deploy_status({})
        deploy_hash = str(decision.get("deployHash") or "")
        if refresh_status and deploy_hash:
            return CasperDecisionContractService.get_deploy_status({
                "deployHash": deploy_hash,
                "refresh": True,
            })
        if isinstance(decision.get("deployStatus"), dict):
            status = dict(decision["deployStatus"])
            status.setdefault("deployHash", deploy_hash or None)
            return status
        status = CasperDecisionContractService.get_deploy_status({
            "deployHash": deploy_hash,
            "refresh": refresh_status,
        })
        if deploy_hash and status.get("status") != "confirmed":
            status["status"] = "pending_or_unverified"
            status["hardBlockers"] = ["casper_deploy_not_confirmed"]
        return status

    @staticmethod
    def readback_status(decision: dict[str, Any] | None) -> dict[str, Any]:
        if not decision:
            return {"verified": False, "status": "missing", "hardBlockers": ["casper_readback_missing"]}
        readback = decision.get("readback") if isinstance(decision.get("readback"), dict) else None
        if not readback:
            return {"verified": False, "status": "missing", "hardBlockers": ["casper_readback_missing"]}
        expected = decision.get("proofDigest")
        observed = readback.get("proofDigest")
        readback_sources = {"casper_client_query_global_state", "casper_json_rpc_query_global_state"}
        verified = bool(
            expected
            and observed == expected
            and readback.get("source") in readback_sources
            and readback.get("stateRootHash")
            and readback.get("receiptVerified") is True
        )
        return {
            "verified": verified,
            "status": "verified" if verified else "digest_mismatch",
            "expectedProofDigest": expected,
            "observedProofDigest": observed,
            "hardBlockers": [] if verified else ["casper_readback_digest_mismatch"],
        }

    @staticmethod
    def bundle_blockers(
        preflight: dict[str, Any],
        deploy_status: dict[str, Any],
        readback: dict[str, Any],
    ) -> list[str]:
        blockers = list(preflight.get("hardBlockers") or [])
        blockers.extend(deploy_status.get("hardBlockers") or [])
        blockers.extend(readback.get("hardBlockers") or [])
        return list(dict.fromkeys(str(blocker) for blocker in blockers))

    @staticmethod
    def proof_score(
        preflight: dict[str, Any],
        decision: dict[str, Any] | None,
        deploy_status: dict[str, Any],
        readback: dict[str, Any],
        blockers: list[str],
    ) -> dict[str, Any]:
        checks = {
            "casperAccountConfigured": "casper_account_missing" not in blockers,
            "casperRpcReachable": preflight.get("rpcReachable") is True,
            "casperContractConfigured": "casper_decision_contract_hash_missing" not in blockers,
            "decisionPayloadValid": bool((decision or {}).get("proofDigest")),
            "casperDeployConfirmed": deploy_status.get("status") == "confirmed",
            "readbackMatchesDigest": bool(readback.get("verified")),
            "agentRationalePresent": bool((decision or {}).get("rationale")),
            "policyGateApproved": (decision or {}).get("policyGate") == "approved"
            or bool(((decision or {}).get("materialityGate") or {}).get("passed")),
            "decisionReceiptPresent": bool((decision or {}).get("decisionReceipt")),
            "evidenceSourceHashPresent": bool(((decision or {}).get("evidenceBundle") or {}).get("sourceHash")),
            "evidenceGraphDigestPresent": bool(
                (((decision or {}).get("evidenceBundle") or {}).get("evidenceGraph") or {}).get("graphDigest")
            ),
            "x402PaidEvidenceVerified": ((decision or {}).get("x402") or {}).get("status") == "verified",
            "guardrailHashPresent": bool((decision or {}).get("guardrailHash")),
        }
        return {
            "hardBlocked": bool(blockers),
            "hardBlockers": blockers,
            "checks": checks,
            "score": sum(1 for passed in checks.values() if passed),
            "total": len(checks),
        }

    @staticmethod
    def lifecycle(
        decision: dict[str, Any] | None,
        deploy_status: dict[str, Any],
        readback: dict[str, Any],
    ) -> list[dict[str, str]]:
        guardrails = (decision or {}).get("guardrails") if isinstance((decision or {}).get("guardrails"), dict) else {}
        return [
            {"state": "sense", "status": "complete" if decision else "waiting"},
            {"state": "propose", "status": "complete" if guardrails else ("complete" if decision else "waiting")},
            {"state": "critique", "status": "complete" if guardrails else "waiting"},
            {"state": "policy_gate", "status": str((decision or {}).get("policyGate") or "blocked")},
            {"state": "submit", "status": str(deploy_status.get("status") or "not_submitted")},
            {"state": "readback", "status": str(readback.get("status") or "missing")},
        ]
