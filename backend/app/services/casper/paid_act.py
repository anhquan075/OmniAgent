"""Paid-act lab — judge path for x402 buy → verify → act.

Three public steps:
  1. probe_unpaid — GET evidence without payment → HTTP 402
  2. verify_settle — bound finals settle canary (WCSPR CEP-18)
  3. enforce_from_paid — unpaid stays blocked; paid unlocks enforce story
"""

from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.settings import get_settings
from app.services.casper.x402 import CasperX402EvidenceService

X402_EVIDENCE_ROUTE_PATH = "/api/x402/rwa-evidence"

STEPS: tuple[dict[str, Any], ...] = (
    {
        "id": "probe_unpaid",
        "title": "Buy — unpaid evidence",
        "order": 1,
        "explanation": (
            "Premium RWA evidence is paywalled with native Casper x402 "
            "(not Base/USDC). Unpaid requests get HTTP 402."
        ),
        "actionLabel": "Probe unpaid",
        "expectedOutcome": "HTTP 402 on casper:casper-test with WCSPR price tag",
    },
    {
        "id": "verify_settle",
        "title": "Verify — settle canary",
        "order": 2,
        "explanation": (
            "Finals CEP-18 settle is bound into the decision receipt. "
            "Judges verify the explorer deploy without holding a wallet."
        ),
        "actionLabel": "Verify settle",
        "expectedOutcome": "x402 status=verified, bindingStatus=bound, settle TX on explorer",
    },
    {
        "id": "enforce_from_paid",
        "title": "Act — enforce from paid evidence",
        "order": 3,
        "explanation": (
            "Without a bound payment, enforce stays blocked. "
            "With verified x402, the vault enforce path unlocks."
        ),
        "actionLabel": "Enforce from paid",
        "expectedOutcome": "Unpaid blocked · paid unlocks vault enforce story",
    },
)


class CasperPaidActService:
    @staticmethod
    def public_paid_act() -> dict[str, Any]:
        readiness = CasperX402EvidenceService.get_readiness({})
        receipt = readiness.get("receipt") if isinstance(readiness.get("receipt"), dict) else {}
        settle_hash = str(receipt.get("settlementTxHash") or "").strip() or None
        explorer = get_settings().casper_explorer_url.rstrip("/")
        settle_url = f"{explorer}/deploy/{settle_hash}" if settle_hash and explorer else None
        verified = readiness.get("status") == "verified"
        steps: list[dict[str, Any]] = []
        for step in STEPS:
            item = {
                **step,
                "status": CasperPaidActService._step_status(step["id"], verified, settle_hash),
                "settlementTxHash": settle_hash if step["id"] != "probe_unpaid" else None,
                "explorerUrl": settle_url if step["id"] != "probe_unpaid" else None,
                "endpoint": X402_EVIDENCE_ROUTE_PATH,
            }
            steps.append(item)
        ready_count = sum(1 for step in steps if step["status"] == "ready")
        return {
            "status": "ready" if ready_count == len(STEPS) else "partial",
            "count": len(STEPS),
            "readyCount": ready_count,
            "tryPath": "/try",
            "endpoint": "/api/public/paid-act",
            "evidenceEndpoint": X402_EVIDENCE_ROUTE_PATH,
            "x402Status": readiness.get("status"),
            "bindingStatus": receipt.get("bindingStatus"),
            "settlementTxHash": settle_hash,
            "explorerUrl": settle_url,
            "steps": steps,
        }

    @staticmethod
    def _step_status(step_id: str, verified: bool, settle_hash: str | None) -> str:
        if step_id == "probe_unpaid":
            return "ready"
        if step_id == "verify_settle":
            return "ready" if verified and settle_hash else "pending"
        return "ready" if verified else "pending"

    @staticmethod
    def run_step(step_id: str) -> dict[str, Any]:
        step = next((item for item in STEPS if item["id"] == step_id), None)
        if step is None:
            return {"ok": False, "status": "unknown_step", "stepId": step_id}
        if step_id == "probe_unpaid":
            return CasperPaidActService._run_probe_unpaid(step)
        if step_id == "verify_settle":
            return CasperPaidActService._run_verify_settle(step)
        return CasperPaidActService._run_enforce_from_paid(step)

    @staticmethod
    def _run_probe_unpaid(step: dict[str, Any]) -> dict[str, Any]:
        from app.services.casper.x402_endpoint import CasperX402EvidenceEndpointService

        settings = get_settings()
        url = CasperX402EvidenceEndpointService.public_url(settings)
        setup = CasperX402EvidenceEndpointService.setup_status(settings, url)
        http_status: int | None = None
        body: dict[str, Any] = {}
        try:
            request = Request(url, headers={"Accept": "application/json"}, method="GET")
            with urlopen(request, timeout=12) as response:
                http_status = int(response.status)
                raw = response.read().decode("utf-8", errors="replace")
                parsed = json.loads(raw) if raw else {}
                body = parsed if isinstance(parsed, dict) else {}
        except HTTPError as exc:
            http_status = int(exc.code)
            try:
                raw = exc.read().decode("utf-8", errors="replace")
                parsed = json.loads(raw) if raw else {}
                body = parsed if isinstance(parsed, dict) else {}
            except (OSError, ValueError, json.JSONDecodeError):
                body = {"error": str(exc.reason)}
        except (URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as exc:
            return {
                "ok": False,
                "status": "probe_failed",
                "mode": "live_probe",
                "stepId": step["id"],
                "title": step["title"],
                "explanation": step["explanation"],
                "expectedOutcome": step["expectedOutcome"],
                "endpoint": url,
                "hardBlockers": ["x402_probe_unreachable"],
                "hint": str(exc),
                "setup": setup,
            }

        accepts = body.get("accepts") if isinstance(body.get("accepts"), list) else []
        first = accepts[0] if accepts and isinstance(accepts[0], dict) else {}
        network = str(first.get("network") or body.get("network") or "")
        ok = http_status == 402 and network.startswith("casper:")
        return {
            "ok": ok,
            "status": "payment_required" if ok else "unexpected_response",
            "mode": "live_probe",
            "stepId": step["id"],
            "title": step["title"],
            "explanation": step["explanation"],
            "expectedOutcome": step["expectedOutcome"],
            "endpoint": url,
            "httpStatus": http_status,
            "paymentNetwork": network or None,
            "amount": first.get("amount") or body.get("amount"),
            "currency": settings.casper_x402_currency,
            "asset": first.get("asset"),
            "error": body.get("error"),
            "hardBlockers": [] if ok else ["x402_unpaid_probe_not_402"],
            "contrast": {
                "unpaid": "blocked — HTTP 402 Payment Required",
                "paid": "settled CEP-18 unlocks evidence + enforce",
            },
        }

    @staticmethod
    def _run_verify_settle(step: dict[str, Any]) -> dict[str, Any]:
        readiness = CasperX402EvidenceService.get_readiness({})
        receipt = readiness.get("receipt") if isinstance(readiness.get("receipt"), dict) else {}
        settle_hash = str(receipt.get("settlementTxHash") or "").strip() or None
        explorer = get_settings().casper_explorer_url.rstrip("/")
        explorer_url = f"{explorer}/deploy/{settle_hash}" if settle_hash and explorer else None
        verified = readiness.get("status") == "verified"
        bound = receipt.get("bindingStatus") == "bound"
        ok = verified and bound and bool(settle_hash)
        return {
            "ok": ok,
            "status": "verified" if ok else "settle_pending",
            "mode": "canary",
            "stepId": step["id"],
            "title": step["title"],
            "explanation": step["explanation"],
            "expectedOutcome": step["expectedOutcome"],
            "x402Status": readiness.get("status"),
            "bindingStatus": receipt.get("bindingStatus"),
            "receiptId": receipt.get("receiptId"),
            "receiptHash": receipt.get("receiptHash"),
            "amount": receipt.get("amount"),
            "currency": receipt.get("currency"),
            "network": receipt.get("network"),
            "settlementTxHash": settle_hash,
            "explorerUrl": explorer_url,
            "hardBlockers": list(readiness.get("hardBlockers") or [])
            if not ok
            else [],
            "contrast": {
                "unpaid": "no settlementTxHash · evidence stays locked",
                "paid": f"settle {settle_hash[:10]}… bound into receipt" if settle_hash else "pending",
            },
        }

    @staticmethod
    def _run_enforce_from_paid(step: dict[str, Any]) -> dict[str, Any]:
        # Lazy import avoids circular dependency with public_proof.paidAct.
        from app.services.casper.public_proof import CasperPublicProofService

        readiness = CasperX402EvidenceService.get_readiness({})
        receipt = readiness.get("receipt") if isinstance(readiness.get("receipt"), dict) else {}
        proof = CasperPublicProofService.get_public_proof({})
        vault = proof.get("vault") if isinstance(proof.get("vault"), dict) else {}
        settle_hash = str(receipt.get("settlementTxHash") or "").strip() or None
        explorer = get_settings().casper_explorer_url.rstrip("/")
        explorer_url = f"{explorer}/deploy/{settle_hash}" if settle_hash and explorer else None
        verified = readiness.get("status") == "verified"
        enforce_armed = bool(vault.get("enforceEnabled"))
        unpaid_blockers = ["x402_receipt_missing", "enforce_locked_until_paid"]
        if not verified:
            return {
                "ok": False,
                "status": "blocked",
                "mode": "gate",
                "stepId": step["id"],
                "title": step["title"],
                "explanation": step["explanation"],
                "expectedOutcome": step["expectedOutcome"],
                "unlocked": False,
                "hardBlockers": unpaid_blockers + list(readiness.get("hardBlockers") or []),
                "contrast": {
                    "unpaid": "enforce locked — no bound x402 receipt",
                    "paid": "settle + bind receipt → unlock vault enforce",
                },
                "hint": "Run verify_settle after CASPER_X402_RECEIPT is bound on Railway.",
            }

        action = proof.get("action")
        vault_entry = None
        action_map = vault.get("actionMap") if isinstance(vault.get("actionMap"), dict) else {}
        if action and action_map:
            vault_entry = action_map.get(str(action))
        return {
            "ok": True,
            "status": "unlocked",
            "mode": "gate",
            "stepId": step["id"],
            "title": step["title"],
            "explanation": step["explanation"],
            "expectedOutcome": step["expectedOutcome"],
            "unlocked": True,
            "x402Status": readiness.get("status"),
            "bindingStatus": receipt.get("bindingStatus"),
            "settlementTxHash": settle_hash,
            "explorerUrl": explorer_url,
            "decisionId": proof.get("decisionId"),
            "decisionAction": action,
            "vaultEntry": vault_entry or vault.get("lastAction"),
            "vaultEnforceEnabled": enforce_armed,
            "vaultTransactionHash": vault.get("transactionHash"),
            "vaultExplorerUrl": vault.get("explorerUrl"),
            "decisionDeployHash": proof.get("deployHash"),
            "decisionExplorerUrl": proof.get("explorerUrl"),
            "hardBlockers": [],
            "contrast": {
                "unpaid": "blocked — HTTP 402 + enforce locked",
                "paid": (
                    f"verified settle unlocks enforce"
                    f"{f' · {action}→{vault_entry}' if action and vault_entry else ''}"
                ),
            },
        }
