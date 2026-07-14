import json
import os
import re
from typing import Any

from app.core.settings import get_settings
from app.services.casper.hashing import sha256_json


class CasperX402EvidenceService:
    PUBLIC_RECEIPT_FIELDS = ("receiptId", "provider", "resourceUrl", "paidAt", "amount", "currency")
    OPTIONAL_PUBLIC_RECEIPT_FIELDS = (
        "network",
        "paymentIdentifier",
        "requestHash",
        "sourceHash",
        "seller",
        "buyer",
        "signatureHash",
    )
    SECRET_KEY_PATTERN = re.compile(r"(authorization|api[_-]?key|secret|token)", re.IGNORECASE)

    @staticmethod
    def get_readiness(args: dict[str, Any]) -> dict[str, Any]:
        endpoint = str(
            args.get("x402EvidenceUrl")
            or os.getenv("CASPER_X402_EVIDENCE_URL")
            or get_settings().casper_x402_evidence_url
            or ""
        ).strip()
        raw_receipt = (
            args.get("x402Receipt")
            or os.getenv("CASPER_X402_RECEIPT")
            or get_settings().casper_x402_receipt
        )
        blockers: list[str] = []
        expected = CasperX402EvidenceService._expected_binding(args)
        receipt = CasperX402EvidenceService._normalize_receipt(raw_receipt, expected)
        if not endpoint:
            blockers.append("x402_evidence_endpoint_missing")
        if endpoint and not raw_receipt:
            blockers.append("x402_receipt_missing")
        if raw_receipt and receipt is None:
            blockers.append("x402_receipt_invalid")
        if receipt and receipt.get("bindingStatus") != "bound":
            blockers.append("x402_receipt_unbound")
        status = "verified" if endpoint and receipt and not blockers else (
            "configured" if endpoint and raw_receipt and receipt else "unavailable"
        )
        return {
            "network": "casper",
            "status": status,
            "endpoint": endpoint or None,
            "receipt": receipt,
            "hardBlockers": blockers,
        }

    @staticmethod
    def _normalize_receipt(raw_receipt: object, expected: dict[str, str]) -> dict[str, Any] | None:
        if isinstance(raw_receipt, str):
            try:
                parsed = json.loads(raw_receipt)
            except ValueError:
                return None
        elif isinstance(raw_receipt, dict):
            parsed = raw_receipt
        else:
            return None
        if not isinstance(parsed, dict) or CasperX402EvidenceService._contains_secret(parsed):
            return None
        public = {
            field: str(parsed.get(field) or "").strip()
            for field in CasperX402EvidenceService.PUBLIC_RECEIPT_FIELDS
        }
        if any(not value for value in public.values()):
            return None
        optional = {
            field: str(parsed.get(field) or "").strip()
            for field in CasperX402EvidenceService.OPTIONAL_PUBLIC_RECEIPT_FIELDS
            if str(parsed.get(field) or "").strip()
        }
        binding_status = CasperX402EvidenceService._binding_status(public, optional, expected)
        receipt_hash = str(parsed.get("receiptHash") or sha256_json(public))
        return {
            **public,
            **optional,
            "receiptHash": receipt_hash,
            "bindingStatus": binding_status,
        }

    @staticmethod
    def _expected_binding(args: dict[str, Any]) -> dict[str, str]:
        evidence = args.get("evidenceBundle") if isinstance(args.get("evidenceBundle"), dict) else {}
        request_hash = str(args.get("x402RequestHash") or args.get("requestHash") or "").strip()
        source_hash = str(args.get("sourceHash") or evidence.get("sourceHash") or "").strip()
        resource_url = str(args.get("x402EvidenceUrl") or args.get("resourceUrl") or "").strip()
        if not resource_url:
            resource_url = str(
                os.getenv("CASPER_X402_EVIDENCE_URL")
                or get_settings().casper_x402_evidence_url
                or ""
            ).strip()
        return {
            "requestHash": request_hash,
            "sourceHash": source_hash,
            "resourceUrl": resource_url,
        }

    @staticmethod
    def _binding_status(public: dict[str, str], optional: dict[str, str], expected: dict[str, str]) -> str:
        if expected["sourceHash"] and optional.get("sourceHash") and optional.get("sourceHash") != expected["sourceHash"]:
            return "unbound"
        if expected["requestHash"] and optional.get("requestHash") and optional.get("requestHash") != expected["requestHash"]:
            return "unbound"
        if expected["sourceHash"] and optional.get("sourceHash") == expected["sourceHash"]:
            return "bound"
        if expected["requestHash"] and optional.get("requestHash") == expected["requestHash"]:
            return "bound"
        if expected["resourceUrl"] and public["resourceUrl"] == expected["resourceUrl"]:
            return "bound"
        return "unbound"

    @staticmethod
    def _contains_secret(payload: dict[str, Any]) -> bool:
        for key, value in payload.items():
            if CasperX402EvidenceService.SECRET_KEY_PATTERN.search(str(key)):
                return True
            if isinstance(value, dict) and CasperX402EvidenceService._contains_secret(value):
                return True
            if isinstance(value, str) and CasperX402EvidenceService._looks_like_secret(value):
                return True
        return False

    @staticmethod
    def _looks_like_secret(value: str) -> bool:
        normalized = value.strip()
        if normalized.lower().startswith(("bearer ", "basic ")):
            return True
        return bool(re.fullmatch(r"[A-Za-z0-9_\-]{48,}", normalized))
