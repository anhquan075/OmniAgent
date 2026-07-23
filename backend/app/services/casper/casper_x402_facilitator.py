"""Casper-native x402 facilitator client (CSPR.cloud).

Speaks the facilitator HTTP API directly — verify + settle — instead of the
EVM ``ExactEvmServerScheme`` middleware. Faithful to the Casper reference
envelope (``exact`` scheme, ``casper:*`` CAIP-2, CEP-18
``transfer_with_authorization``).
"""

from __future__ import annotations

import base64
import binascii
import json
from dataclasses import dataclass, field
from typing import Any

import httpx

X402_VERSION = 2
DEFAULT_FACILITATOR_URL = "https://x402-facilitator.cspr.cloud"
NETWORK_TESTNET = "casper:casper-test"
# make-software reference CEP-18 with transfer_with_authorization (Casper testnet).
DEFAULT_CEP18_ASSET = (
    "hash-cb65a928f8e1b7ce172bddd075c10dd0de8bcfd9cf808c799fd409766a1735c3"
)


@dataclass(frozen=True)
class CasperX402Config:
    """Resolved paywall settings for one protected resource."""

    facilitator_url: str
    network: str
    pay_to: str
    asset: str
    amount: str
    description: str
    api_key: str = ""
    currency: str = "WCSPR"
    mime_type: str = "application/json"
    max_timeout_seconds: int = 60
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def configured(self) -> bool:
        """True when enough is set to emit a real Casper price tag."""
        return bool(self.pay_to and self.asset and self.amount and self.network.startswith("casper:"))

    @property
    def settle_ready(self) -> bool:
        """True when facilitator settlement can run (needs sponsored API key)."""
        return self.configured and bool(self.api_key)


@dataclass(frozen=True)
class SettlementResult:
    """Outcome of facilitator ``/settle``."""

    success: bool
    transaction: str = ""
    network: str = ""
    payer: str = ""
    error: str = ""

    def response_header(self) -> str:
        """Base64 JSON for ``X-PAYMENT-RESPONSE``."""
        payload = {
            "success": self.success,
            "transaction": self.transaction,
            "network": self.network,
            "payer": self.payer,
        }
        return base64.b64encode(json.dumps(payload).encode()).decode()

    def receipt_dict(self, *, resource_url: str, amount: str, currency: str, seller: str) -> dict[str, Any]:
        """Public receipt shape for OmniAgent proof binding."""
        return {
            "receiptId": self.transaction or "unsettled",
            "provider": "x402",
            "resourceUrl": resource_url,
            "paidAt": None,
            "amount": amount,
            "currency": currency,
            "network": self.network,
            "paymentIdentifier": self.transaction,
            "seller": seller,
            "buyer": self.payer,
            "settlementTxHash": self.transaction,
            "bindingStatus": "bound" if self.success and self.transaction else "unbound",
        }


def build_payment_requirements(cfg: CasperX402Config, resource: str) -> dict[str, Any]:
    """Build one x402 PaymentRequirements object (Casper facilitator shape)."""
    return {
        "scheme": "exact",
        "network": cfg.network,
        # Casper facilitator reads ``amount`` (not maxAmountRequired).
        "amount": cfg.amount,
        "resource": resource,
        "description": cfg.description,
        "mimeType": cfg.mime_type,
        "payTo": cfg.pay_to,
        "maxTimeoutSeconds": cfg.max_timeout_seconds,
        "asset": cfg.asset,
        "extra": cfg.extra,
    }


def payment_required_body(
    cfg: CasperX402Config, resource: str, *, error: str
) -> dict[str, Any]:
    """JSON body for HTTP 402 responses."""
    return {
        "x402Version": X402_VERSION,
        "accepts": [build_payment_requirements(cfg, resource)],
        "error": error,
        "provider": "x402",
        "network": "casper",
    }


def payment_required_headers(cfg: CasperX402Config, resource: str) -> dict[str, str]:
    """Headers mirroring requirements for clients that read PAYMENT-REQUIRED."""
    requirements = build_payment_requirements(cfg, resource)
    header_blob = base64.b64encode(json.dumps(requirements).encode()).decode()
    return {
        "PAYMENT-REQUIRED": header_blob,
        "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, X-PAYMENT-RESPONSE, Payment-Response",
    }


def read_payment_header(headers: Any) -> str | None:
    """Pull signed payment payload from request headers."""
    return headers.get("X-PAYMENT") or headers.get("Payment-Signature") or headers.get("PAYMENT-SIGNATURE")


def decode_payment_payload(raw: str) -> dict[str, Any]:
    """Decode ``X-PAYMENT`` header (base64 JSON or raw JSON)."""
    raw = raw.strip()
    try:
        decoded = base64.b64decode(raw, validate=True).decode()
        return json.loads(decoded)
    except (binascii.Error, ValueError, UnicodeDecodeError):
        pass
    return json.loads(raw)


class CasperX402Facilitator:
    """Thin client for CSPR.cloud x402 facilitator ``/verify`` + ``/settle``."""

    def __init__(self, cfg: CasperX402Config) -> None:
        self._cfg = cfg

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._cfg.api_key:
            # Casper reference servers send the key as raw Authorization (no Bearer).
            headers["Authorization"] = self._cfg.api_key
        return headers

    async def supported(self) -> dict[str, Any]:
        """GET /supported — schemes, networks, feePayer."""
        async with httpx.AsyncClient(timeout=self._cfg.max_timeout_seconds) as client:
            resp = await client.get(
                f"{self._cfg.facilitator_url.rstrip('/')}/supported",
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()

    async def verify(
        self, payload: dict[str, Any], requirements: dict[str, Any]
    ) -> tuple[bool, str, str]:
        """POST /verify — signature + replay check, no chain write."""
        body = {
            "x402Version": X402_VERSION,
            "paymentPayload": payload,
            "paymentRequirements": requirements,
        }
        async with httpx.AsyncClient(timeout=self._cfg.max_timeout_seconds) as client:
            resp = await client.post(
                f"{self._cfg.facilitator_url.rstrip('/')}/verify",
                headers=self._headers(),
                json=body,
            )
            if resp.status_code != 200:
                return (
                    False,
                    "",
                    f"facilitator /verify HTTP {resp.status_code}: {resp.text[:200]}",
                )
            data = resp.json()
            return (
                bool(data.get("isValid")),
                str(data.get("payer", "")),
                str(data.get("invalidReason") or ""),
            )

    async def settle(
        self, payload: dict[str, Any], requirements: dict[str, Any]
    ) -> SettlementResult:
        """POST /settle — submit CEP-18 transfer_with_authorization."""
        body = {
            "x402Version": X402_VERSION,
            "paymentPayload": payload,
            "paymentRequirements": requirements,
        }
        async with httpx.AsyncClient(timeout=self._cfg.max_timeout_seconds) as client:
            resp = await client.post(
                f"{self._cfg.facilitator_url.rstrip('/')}/settle",
                headers=self._headers(),
                json=body,
            )
            if resp.status_code != 200:
                return SettlementResult(
                    success=False,
                    error=f"facilitator /settle HTTP {resp.status_code}: {resp.text[:200]}",
                )
            data = resp.json()
            return SettlementResult(
                success=bool(data.get("success")),
                transaction=str(data.get("transaction", "")),
                network=str(data.get("network", requirements.get("network", ""))),
                payer=str(data.get("payer", "")),
                error=str(data.get("errorReason") or ""),
            )


async def gate_payment(
    *,
    cfg: CasperX402Config,
    resource: str,
    payment_header: str | None,
) -> tuple[SettlementResult | None, dict[str, Any] | None, dict[str, str] | None]:
    """Gate a request behind Casper x402 settlement.

    Returns ``(settlement, error_body, error_headers)``. On success error fields
    are None. On failure settlement is None and error_body is a 402 payload.
    """
    if not cfg.configured:
        body = payment_required_body(
            cfg,
            resource,
            error=(
                "x402 Casper paywall is not fully configured "
                "(set CASPER_X402_PAY_TO_ADDRESS, CASPER_X402_ASSET, "
                "and CASPER_X402_AMOUNT)."
            ),
        )
        return None, body, payment_required_headers(cfg, resource)

    if not payment_header:
        body = payment_required_body(cfg, resource, error="X-PAYMENT header is required")
        return None, body, payment_required_headers(cfg, resource)

    try:
        payload = decode_payment_payload(payment_header)
    except (ValueError, json.JSONDecodeError):
        body = payment_required_body(
            cfg, resource, error="malformed X-PAYMENT header (expected base64 JSON)"
        )
        return None, body, payment_required_headers(cfg, resource)

    if not cfg.settle_ready:
        body = payment_required_body(
            cfg,
            resource,
            error=(
                "x402 facilitator API key missing "
                "(set CASPER_X402_FACILITATOR_API_KEY or CASPER_CSPR_CLOUD_API_KEY)."
            ),
        )
        return None, body, payment_required_headers(cfg, resource)

    requirements = build_payment_requirements(cfg, resource)
    facilitator = CasperX402Facilitator(cfg)

    is_valid, _payer, reason = await facilitator.verify(payload, requirements)
    if not is_valid:
        body = payment_required_body(
            cfg, resource, error=f"payment verification failed: {reason}"
        )
        return None, body, payment_required_headers(cfg, resource)

    result = await facilitator.settle(payload, requirements)
    if not result.success:
        body = payment_required_body(
            cfg, resource, error=f"settlement failed: {result.error}"
        )
        return None, body, payment_required_headers(cfg, resource)

    return result, None, None
