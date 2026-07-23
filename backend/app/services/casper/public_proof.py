from datetime import datetime, timezone
import json
from pathlib import Path
import re
from typing import Any

from app.core.settings import get_settings
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.loop import get_loop_status
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
        proof_score = bundle.get("proofScore") if isinstance(bundle.get("proofScore"), dict) else {}
        hard_blockers = CasperPublicProofService._public_blockers(proof_score.get("hardBlockers"))
        return {
            "network": "casper",
            "scenario": CasperPublicProofService.SCENARIO,
            "status": bundle.get("status"),
            "hardBlockers": hard_blockers,
            "createdAt": CasperPublicProofService._string_or_none(options.get("createdAt"))
            or decision.get("timestamp")
            or datetime.now(timezone.utc).isoformat(),
            "generatedFrom": "dashboard-proof-log",
            "demoUrl": CasperPublicProofService._string_or_none(options.get("demoUrl"))
            or CasperPublicProofService._string_or_none(settings.casper_demo_url),
            "videoUrl": CasperPublicProofService._string_or_none(options.get("videoUrl"))
            or CasperPublicProofService._string_or_none(settings.casper_demo_video_url),
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
            "evidenceGraph": CasperPublicProofService._evidence_graph(decision),
            "policyTemplate": CasperPublicProofService._policy_template(decision),
            "readback": CasperPublicProofService._readback(decision, bundle.get("readback")),
            "proofScore": CasperPublicProofService._proof_score(proof_score),
            "recoveryCandidates": CasperPublicProofService._recovery_candidates(
                bundle.get("recoveryCandidates")
            ),
            "x402": CasperPublicProofService._x402(decision),
            "vault": CasperPublicProofService._vault(settings),
            "trustSummary": bundle.get("trustSummary"),
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
    def _readback(decision: dict[str, Any], bundle_readback: object = None) -> dict[str, Any]:
        bundle = bundle_readback if isinstance(bundle_readback, dict) else {}
        readback = decision.get("readback") if isinstance(decision.get("readback"), dict) else {}
        return {
            "verified": bundle.get("verified") is True or readback.get("verified") is True,
            "status": bundle.get("status") or readback.get("status") or "missing",
            "expectedProofDigest": bundle.get("expectedProofDigest") or decision.get("proofDigest"),
            "proofDigest": bundle.get("observedProofDigest") or readback.get("proofDigest"),
            "receiptVerified": readback.get("receiptVerified"),
            "decisionReceipt": readback.get("decisionReceipt"),
            "hardBlockers": CasperPublicProofService._public_blockers(
                bundle.get("hardBlockers") or readback.get("hardBlockers")
            ),
        }

    @staticmethod
    def _proof_score(score: dict[str, Any]) -> dict[str, Any]:
        checks = score.get("checks") if isinstance(score.get("checks"), dict) else {}
        return {
            "score": score.get("score"),
            "total": score.get("total"),
            "hardBlocked": bool(score.get("hardBlocked")),
            "hardBlockers": CasperPublicProofService._public_blockers(score.get("hardBlockers")),
            "checks": {str(key): bool(value) for key, value in checks.items()},
        }

    @staticmethod
    def _recovery_candidates(candidates: object) -> list[dict[str, str]]:
        if not isinstance(candidates, list):
            return []
        sanitized: list[dict[str, str]] = []
        for item in candidates:
            if not isinstance(item, dict) or not item.get("blocker"):
                continue
            action = str(item.get("action") or "")
            raw_blocker = str(item.get("blocker") or "")
            blocker = CasperPublicProofService._public_blocker(raw_blocker)
            if blocker != raw_blocker or CasperPublicProofService.SECRET_VALUE_PATTERN.search(action):
                action = "Resolve this Casper readiness blocker in deployment settings."
            sanitized.append({
                "blocker": blocker,
                "action": action,
            })
        return sanitized

    @staticmethod
    def _public_blockers(blockers: object) -> list[str]:
        if not isinstance(blockers, list):
            return []
        sanitized = [CasperPublicProofService._public_blocker(item) for item in blockers]
        return list(dict.fromkeys(blocker for blocker in sanitized if blocker))

    @staticmethod
    def _public_blocker(blocker: object) -> str:
        text = str(blocker or "")
        if not text:
            return ""
        if CasperPublicProofService.SECRET_VALUE_PATTERN.search(text):
            return "casper_signer_not_ready"
        return text

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
        allowed = (
            "receiptId",
            "provider",
            "resourceUrl",
            "paidAt",
            "amount",
            "currency",
            "network",
            "paymentIdentifier",
            "requestHash",
            "sourceHash",
            "seller",
            "buyer",
            "signatureHash",
            "bindingStatus",
            "receiptHash",
            "settlementTxHash",
        )
        return {key: receipt.get(key) for key in allowed if receipt.get(key) is not None}

    @staticmethod
    def _vault(settings: Any) -> dict[str, Any]:
        explorer = str(settings.casper_explorer_url or "").rstrip("/")
        loop = get_loop_status()
        ledger_vault = CasperPublicProofService._latest_vault_ledger_event()
        payload = ledger_vault.get("payload") if isinstance(ledger_vault.get("payload"), dict) else {}
        action = (
            CasperPublicProofService._string_or_none(loop.get("lastVaultAction"))
            or CasperPublicProofService._string_or_none(payload.get("entryPoint"))
            or CasperPublicProofService._string_or_none(ledger_vault.get("action"))
        )
        status = (
            CasperPublicProofService._string_or_none(loop.get("lastVaultStatus"))
            or CasperPublicProofService._string_or_none(payload.get("status"))
            or ("submitted" if payload.get("submitted") else None)
        )
        tx_hash = (
            CasperPublicProofService._string_or_none(loop.get("lastVaultTx"))
            or CasperPublicProofService._string_or_none(payload.get("transactionHash"))
            or CasperPublicProofService._string_or_none(payload.get("deployHash"))
        )
        decision_id = CasperPublicProofService._string_or_none(payload.get("decisionId"))
        asset_id = (
            CasperPublicProofService._string_or_none(payload.get("assetId"))
            or settings.casper_vault_asset_id
        )
        explorer_url = None
        if tx_hash and explorer:
            explorer_url = f"{explorer}/deploy/{tx_hash}"
        elif CasperPublicProofService._string_or_none(payload.get("explorerUrl")):
            explorer_url = str(payload.get("explorerUrl"))
        contract_hash = settings.casper_vault_contract_hash
        package_hash = settings.casper_vault_package_hash
        links: dict[str, str] = {}
        if explorer and contract_hash:
            links["contractHash"] = f"{explorer}/contract/{contract_hash}"
        if explorer and package_hash:
            links["contractPackageHash"] = f"{explorer}/contract-package/{package_hash}"
        configured = bool(contract_hash or package_hash)
        recent_actions = CasperPublicProofService._recent_vault_actions(explorer)
        return {
            "enforceEnabled": bool(settings.casper_vault_enforce_enabled),
            "configured": configured,
            "contractHash": contract_hash,
            "packageHash": package_hash,
            "assetId": asset_id,
            "lastAction": action,
            "lastStatus": status,
            "decisionId": decision_id,
            "transactionHash": tx_hash,
            "explorerUrl": explorer_url,
            "contractLinks": links,
            "actionMap": {
                "block": "freeze",
                "approve": "unfreeze",
                "haircut": "set_ltv",
            },
            "recentActions": recent_actions,
            "stateDelta": CasperPublicProofService._vault_state_delta(action),
        }

    @staticmethod
    def _vault_state_delta(vault_action: str | None) -> dict[str, Any]:
        """Public-safe before/after semantics for the latest vault entry point."""
        action = (vault_action or "").strip().lower()
        if action == "freeze":
            return {
                "entryPoint": "freeze",
                "fromDecision": "block",
                "before": {"frozen": False},
                "after": {"frozen": True},
                "summary": "Collateral position frozen after a block decision receipt.",
            }
        if action == "unfreeze":
            return {
                "entryPoint": "unfreeze",
                "fromDecision": "approve",
                "before": {"frozen": True},
                "after": {"frozen": False},
                "summary": "Collateral position unfrozen after an approve decision receipt.",
            }
        if action == "set_ltv":
            return {
                "entryPoint": "set_ltv",
                "fromDecision": "haircut",
                "before": {"ltvBps": 10000},
                "after": {"ltvBps": 5000},
                "summary": "LTV haircut applied after a haircut decision receipt (100% → 50%).",
            }
        return {
            "entryPoint": action or None,
            "fromDecision": None,
            "before": None,
            "after": None,
            "summary": "No vault enforcement yet for this proof window.",
        }

    @staticmethod
    def _recent_vault_actions(explorer: str, *, limit: int = 5) -> list[dict[str, Any]]:
        summary = CasperDecisionLedger.get_ledger_summary(limit=80, offset=0)
        events = summary.get("events") if isinstance(summary.get("events"), list) else []
        recent: list[dict[str, Any]] = []
        for event in events:
            if not isinstance(event, dict):
                continue
            if event.get("eventType") != "casper_vault_enforcement":
                continue
            payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
            entry = (
                CasperPublicProofService._string_or_none(payload.get("entryPoint"))
                or CasperPublicProofService._string_or_none(event.get("action"))
            )
            if entry not in {"freeze", "unfreeze", "set_ltv"}:
                continue
            tx_hash = (
                CasperPublicProofService._string_or_none(payload.get("transactionHash"))
                or CasperPublicProofService._string_or_none(payload.get("deployHash"))
            )
            if not tx_hash:
                continue
            explorer_url = CasperPublicProofService._string_or_none(payload.get("explorerUrl"))
            if not explorer_url and tx_hash and explorer:
                explorer_url = f"{explorer}/deploy/{tx_hash}"
            recent.append(
                {
                    "entryPoint": entry,
                    "status": CasperPublicProofService._string_or_none(payload.get("status"))
                    or ("submitted" if payload.get("submitted") else None),
                    "decisionId": CasperPublicProofService._string_or_none(payload.get("decisionId")),
                    "transactionHash": tx_hash,
                    "explorerUrl": explorer_url,
                    "assetId": CasperPublicProofService._string_or_none(payload.get("assetId")),
                }
            )
            if len(recent) >= limit:
                break
        return recent

    @staticmethod
    def _latest_vault_ledger_event() -> dict[str, Any]:
        summary = CasperDecisionLedger.get_ledger_summary(limit=50, offset=0)
        events = summary.get("events") if isinstance(summary.get("events"), list) else []
        for event in events:
            if not isinstance(event, dict):
                continue
            if event.get("eventType") == "casper_vault_enforcement":
                return event
        return {}

    @staticmethod
    def _evidence_graph(decision: dict[str, Any]) -> dict[str, Any] | None:
        evidence = decision.get("evidenceBundle") if isinstance(decision.get("evidenceBundle"), dict) else {}
        graph = evidence.get("evidenceGraph") if isinstance(evidence.get("evidenceGraph"), dict) else None
        if not graph:
            return None
        return {
            "scenario": graph.get("scenario"),
            "graphDigest": graph.get("graphDigest"),
            "sourceCount": graph.get("sourceCount"),
            "observedSourceCount": graph.get("observedSourceCount"),
            "staleSourceCount": graph.get("staleSourceCount"),
            "missingSourceCount": graph.get("missingSourceCount"),
        }

    @staticmethod
    def _policy_template(decision: dict[str, Any]) -> dict[str, Any] | None:
        template = decision.get("policyTemplate") if isinstance(decision.get("policyTemplate"), dict) else None
        if not template:
            return None
        return {
            "id": template.get("id"),
            "label": template.get("label"),
            "templateHash": template.get("templateHash"),
        }

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
            links["contractPackageHash"] = (
                f"{explorer}/contract-package/{settings.casper_decision_contract_package_hash}"
            )
        if explorer and settings.casper_vault_contract_hash:
            links["vaultContractHash"] = f"{explorer}/contract/{settings.casper_vault_contract_hash}"
        if explorer and settings.casper_vault_package_hash:
            links["vaultContractPackageHash"] = (
                f"{explorer}/contract-package/{settings.casper_vault_package_hash}"
            )
        return links

    @staticmethod
    def _string_or_none(value: object) -> str | None:
        text = str(value or "").strip()
        return text or None
