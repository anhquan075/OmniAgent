import json
import os
import re
from typing import Any

from app.core.settings import get_settings
from app.services.casper.hashing import sha256_json


class CasperX402EvidenceService:
    PUBLIC_RECEIPT_FIELDS = ("receiptId", "provider", "resourceUrl", "paidAt", "amount", "currency")
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
        receipt = CasperX402EvidenceService._normalize_receipt(raw_receipt)
        if not endpoint:
            blockers.append("x402_evidence_endpoint_missing")
        if endpoint and not raw_receipt:
            blockers.append("x402_receipt_missing")
        if raw_receipt and receipt is None:
            blockers.append("x402_receipt_invalid")
        return {
            "network": "casper",
            "status": "ready" if endpoint and receipt and not blockers else "unavailable",
            "endpoint": endpoint or None,
            "receipt": receipt,
            "hardBlockers": blockers,
        }

    @staticmethod
    def _normalize_receipt(raw_receipt: object) -> dict[str, Any] | None:
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
        receipt_hash = str(parsed.get("receiptHash") or sha256_json(public))
        return {**public, "receiptHash": receipt_hash}

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
