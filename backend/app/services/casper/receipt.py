from typing import Any

from app.services.casper.hashing import sha256_text
from app.services.casper.ledger import CasperDecisionLedger


class CasperDecisionReceiptService:
    @staticmethod
    def receipt_from_decision(decision: dict[str, Any]) -> dict[str, Any]:
        receipt_value = CasperDecisionReceiptService.receipt_value(decision)
        return {
            "network": "casper",
            "receiptId": str(decision.get("receiptId") or decision.get("decisionId") or ""),
            "decisionId": str(decision.get("decisionId") or ""),
            "action": str(decision.get("action") or ""),
            "riskScore": int(decision.get("riskScore") or 0),
            "proofDigest": decision.get("proofDigest"),
            "rationaleHash": decision.get("rationaleHash"),
            "sourceHash": decision.get("sourceHash"),
            "timestamp": decision.get("timestamp"),
            "policyGate": decision.get("policyGate"),
            "guardrailHash": decision.get("guardrailHash"),
            "agentAccountHash": decision.get("agentAccountHash"),
            "deployHash": decision.get("deployHash"),
            "transactionHash": decision.get("transactionHash"),
            "receiptValue": receipt_value,
            "receiptHash": sha256_text(receipt_value),
            "readbackVerified": bool((decision.get("readback") or {}).get("proofDigest") == decision.get("proofDigest"))
            if isinstance(decision.get("readback"), dict)
            else False,
        }

    @staticmethod
    def get_decision_receipt(args: dict[str, Any]) -> dict[str, Any]:
        decision = CasperDecisionReceiptService.find_decision(args)
        if not decision:
            return {
                "network": "casper",
                "status": "missing",
                "decisionReceipt": None,
                "hardBlockers": ["casper_decision_receipt_missing"],
            }
        return {
            "network": "casper",
            "status": "found",
            "decision": decision,
            "decisionReceipt": CasperDecisionReceiptService.receipt_from_decision(decision),
            "hardBlockers": [],
        }

    @staticmethod
    def verify_decision_receipt(args: dict[str, Any]) -> dict[str, Any]:
        receipt_result = CasperDecisionReceiptService.get_decision_receipt(args)
        receipt = receipt_result.get("decisionReceipt")
        expected = str(args.get("expectedProofDigest") or (receipt or {}).get("proofDigest") or "")
        observed = str((receipt or {}).get("proofDigest") or "")
        decision = receipt_result.get("decision") if isinstance(receipt_result.get("decision"), dict) else {}
        readback = decision.get("readback") if isinstance(decision.get("readback"), dict) else {}
        expected_receipt = str((receipt or {}).get("receiptValue") or "")
        observed_receipt = str(readback.get("decisionReceipt") or "")
        local_verified = bool(receipt and expected and observed == expected)
        chain_verified = bool(
            local_verified
            and expected_receipt
            and observed_receipt == expected_receipt
            and readback.get("receiptVerified") is True
        )
        blockers = CasperDecisionReceiptService.verify_blockers(
            receipt_result,
            local_verified,
            chain_verified,
            observed_receipt,
        )
        return {
            "network": "casper",
            "status": "verified" if chain_verified else "local_verified_pending_readback",
            "verified": chain_verified,
            "localVerified": local_verified,
            "chainVerified": chain_verified,
            "decisionReceipt": receipt,
            "expectedProofDigest": expected or None,
            "observedProofDigest": observed or None,
            "expectedDecisionReceipt": expected_receipt or None,
            "observedDecisionReceipt": observed_receipt or None,
            "hardBlockers": blockers,
        }

    @staticmethod
    def find_decision(args: dict[str, Any]) -> dict[str, Any]:
        decision_id = str(args.get("decisionId") or args.get("decision_id") or "")
        ledger = CasperDecisionLedger.get_ledger_summary(limit=int(args.get("limit") or 50))
        for event in ledger["events"]:
            payload = event.get("payload") if isinstance(event, dict) else None
            decision = payload.get("decision") if isinstance(payload, dict) else None
            if isinstance(decision, dict) and (not decision_id or str(decision.get("decisionId")) == decision_id):
                return dict(decision)
        return {}

    @staticmethod
    def receipt_value(decision: dict[str, Any]) -> str:
        fields = [
            decision.get("decisionId"),
            decision.get("action"),
            decision.get("riskScore"),
            decision.get("proofDigest"),
            decision.get("rationaleHash"),
            decision.get("sourceHash"),
            decision.get("timestamp"),
            decision.get("policyGate"),
            decision.get("agentAccountHash"),
            decision.get("guardrailHash"),
        ]
        return "|".join(str(value or "") for value in fields)

    @staticmethod
    def parse_receipt_value(value: str) -> dict[str, Any]:
        fields = str(value or "").split("|")
        if len(fields) != 10:
            return {}
        try:
            risk_score = int(fields[2])
        except ValueError:
            return {}
        names = (
            "decisionId",
            "action",
            "riskScore",
            "proofDigest",
            "rationaleHash",
            "sourceHash",
            "timestamp",
            "policyGate",
            "agentAccountHash",
            "guardrailHash",
        )
        parsed = dict(zip(names, fields, strict=True))
        parsed["riskScore"] = risk_score
        return parsed

    @staticmethod
    def verify_blockers(
        receipt_result: dict[str, Any],
        local_verified: bool,
        chain_verified: bool,
        observed_receipt: str,
    ) -> list[str]:
        if chain_verified:
            return []
        blockers = list(receipt_result.get("hardBlockers") or [])
        if not local_verified:
            blockers.append("casper_decision_receipt_mismatch")
        elif not observed_receipt:
            blockers.append("casper_decision_receipt_readback_missing")
        else:
            blockers.append("casper_decision_receipt_mismatch")
        return list(dict.fromkeys(blockers))
