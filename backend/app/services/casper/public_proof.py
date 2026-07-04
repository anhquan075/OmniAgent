from datetime import datetime, timezone
import json
from pathlib import Path
import re
from typing import Any

from app.core.settings import get_settings
from app.services.casper.proof_bundle import CasperProofBundleService


class CasperPublicProofService:
    SCENARIO = "rwa-collateral-nav-risk-receipt"
    SECRET_VALUE_PATTERN = re.compile(
        r"BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|CASPER_SECRET_KEY_PATH|"
        r"API_OPERATOR_TOKEN|Authorization:|Bearer\s+\S+|\.env(?:\.|$)|"
        r"secret\.pem|private[_-]?key|api[_-]?key\s*=|token\s*=",
        re.IGNORECASE,
    )

    @staticmethod
    def get_public_proof(args: dict[str, Any] | None = None) -> dict[str, Any]:
        options = args or {}
        settings = get_settings()
        bundle = CasperProofBundleService.get_live_proof_bundle({"limit": int(options.get("limit") or 10)})
        decision = bundle.get("latestDecision") if isinstance(bundle.get("latestDecision"), dict) else {}
        receipt = CasperPublicProofService._decision_receipt(decision)
        return {
            "network": "casper",
            "scenario": CasperPublicProofService.SCENARIO,
            "status": bundle.get("status"),
            "createdAt": CasperPublicProofService._string_or_none(options.get("createdAt"))
            or decision.get("timestamp")
            or datetime.now(timezone.utc).isoformat(),
            "generatedFrom": "dashboard-proof-log",
            "demoUrl": CasperPublicProofService._string_or_none(options.get("demoUrl")),
            "videoUrl": CasperPublicProofService._string_or_none(options.get("videoUrl")),
            "decisionId": decision.get("decisionId"),
            "action": decision.get("action"),
            "riskScore": decision.get("riskScore"),
            "timestamp": decision.get("timestamp"),
            "proofDigest": decision.get("proofDigest"),
            "sourceHash": decision.get("sourceHash"),
            "guardrailHash": decision.get("guardrailHash"),
            "policyGate": decision.get("policyGate"),
            "deployHash": decision.get("deployHash") or decision.get("transactionHash"),
            "explorerUrl": decision.get("explorerUrl"),
            "accountPublicKey": settings.casper_account_public_key,
            "contractHash": settings.casper_decision_contract_hash,
            "contractPackageHash": settings.casper_decision_contract_package_hash,
            "contractLinks": CasperPublicProofService._contract_links(settings),
            "decisionReceipt": receipt,
            "readback": CasperPublicProofService._readback(decision),
            "x402": CasperPublicProofService._x402(decision),
            "llmTrace": CasperPublicProofService._llm_trace(decision),
            "liveProof": CasperPublicProofService._live_proof(settings, decision, receipt),
            "verifier": {
                "source": "scripts/verify-casper-receipt.sh",
                "proofFile": "proofs/casper-buildathon-submission-proof.json",
                "liveProofCommand": "scripts/verify-casper-live-proof.sh --proof-file proofs/casper-buildathon-submission-proof.json",
                "usesPublicProofEndpoint": True,
                "usesDashboardReceiptEndpoint": True,
            },
        }

    @staticmethod
    def write_public_proof(proof: dict[str, Any], path: Path) -> Path:
        CasperPublicProofService.assert_public_safe(proof)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(proof, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return path

    @staticmethod
    def assert_public_safe(value: object) -> None:
        for item in CasperPublicProofService._walk_values(value):
            if isinstance(item, str) and CasperPublicProofService.SECRET_VALUE_PATTERN.search(item):
                raise ValueError("public proof contains private secret material")

    @staticmethod
    def _walk_values(value: object) -> list[object]:
        if isinstance(value, dict):
            items: list[object] = []
            for key, nested in value.items():
                items.append(key)
                items.extend(CasperPublicProofService._walk_values(nested))
            return items
        if isinstance(value, list):
            items = []
            for nested in value:
                items.extend(CasperPublicProofService._walk_values(nested))
            return items
        return [value]

    @staticmethod
    def _decision_receipt(decision: dict[str, Any]) -> dict[str, Any] | None:
        receipt = decision.get("decisionReceipt") if isinstance(decision.get("decisionReceipt"), dict) else None
        if not receipt:
            return None
        return {
            "receiptValue": receipt.get("receiptValue"),
            "receiptHash": receipt.get("receiptHash"),
        }

    @staticmethod
    def _readback(decision: dict[str, Any]) -> dict[str, Any]:
        readback = decision.get("readback") if isinstance(decision.get("readback"), dict) else {}
        return {
            "verified": readback.get("verified") is True,
            "proofDigest": readback.get("proofDigest"),
            "receiptVerified": readback.get("receiptVerified"),
            "decisionReceipt": readback.get("decisionReceipt"),
        }

    @staticmethod
    def _x402(decision: dict[str, Any]) -> dict[str, Any]:
        x402 = decision.get("x402") if isinstance(decision.get("x402"), dict) else {}
        receipt = x402.get("receipt") if isinstance(x402.get("receipt"), dict) else None
        return {
            "status": x402.get("status") or "unavailable",
            "endpoint": x402.get("endpoint"),
            "receipt": CasperPublicProofService._x402_receipt(receipt),
            "hardBlockers": [str(item) for item in x402.get("hardBlockers") or []],
        }

    @staticmethod
    def _x402_receipt(receipt: dict[str, Any] | None) -> dict[str, Any] | None:
        if not receipt:
            return None
        allowed = ("receiptId", "provider", "resourceUrl", "paidAt", "amount", "currency", "receiptHash")
        return {key: receipt.get(key) for key in allowed if receipt.get(key) is not None}

    @staticmethod
    def _llm_trace(decision: dict[str, Any]) -> dict[str, Any]:
        guardrails = decision.get("guardrails") if isinstance(decision.get("guardrails"), dict) else {}
        roles = guardrails.get("roles") if isinstance(guardrails.get("roles"), list) else []
        return {
            "roles": [
                CasperPublicProofService._public_role(role)
                for role in roles
                if isinstance(role, dict)
            ]
        }

    @staticmethod
    def _public_role(role: dict[str, Any]) -> dict[str, Any]:
        allowed = (
            "agentRole",
            "verdict",
            "traceSource",
            "traceProvider",
            "modelName",
            "promptHash",
            "outputHash",
            "modelClaimHash",
            "modelGenerationHash",
            "rationaleHash",
        )
        return {key: role.get(key) for key in allowed if role.get(key) is not None}

    @staticmethod
    def _live_proof(settings: Any, decision: dict[str, Any], receipt: dict[str, Any] | None) -> dict[str, Any]:
        return {
            "contractInstallDeployHash": getattr(settings, "casper_contract_install_deploy_hash", None),
            "decisionDeployHash": decision.get("deployHash") or decision.get("transactionHash"),
            "contractHash": settings.casper_decision_contract_hash,
            "contractPackageHash": settings.casper_decision_contract_package_hash,
            "proofDigest": decision.get("proofDigest"),
            "decisionId": decision.get("decisionId"),
            "decisionReceipt": (receipt or {}).get("receiptValue"),
        }

    @staticmethod
    def _contract_links(settings: Any) -> dict[str, str]:
        explorer = str(settings.casper_explorer_url or "").rstrip("/")
        links: dict[str, str] = {}
        if explorer and settings.casper_decision_contract_hash:
            links["contractHash"] = f"{explorer}/contract/{settings.casper_decision_contract_hash}"
        if explorer and settings.casper_decision_contract_package_hash:
            links["contractPackageHash"] = f"{explorer}/contract-package/{settings.casper_decision_contract_package_hash}"
        return links

    @staticmethod
    def _string_or_none(value: object) -> str | None:
        text = str(value or "").strip()
        return text or None
