"""OmniAgent x402 evidence paywall — Casper-native settlement."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI
import structlog

from app.core.settings import Settings
from app.services.casper.casper_x402_facilitator import (
    DEFAULT_CEP18_ASSET,
    DEFAULT_FACILITATOR_URL,
    NETWORK_TESTNET,
    CasperX402Config,
    normalize_cep18_asset,
)
from app.services.casper.proof_bundle import CasperProofBundleService
from app.services.casper.public_proof import CasperPublicProofService


logger = structlog.get_logger(__name__)

X402_EVIDENCE_ROUTE_PATH = "/api/x402/rwa-evidence"
X402_EVIDENCE_ROUTE_PATTERN = f"GET {X402_EVIDENCE_ROUTE_PATH}"


class CasperX402EvidenceEndpointService:
    @staticmethod
    def config_from_settings(settings: Settings) -> CasperX402Config:
        """Build Casper x402 config from app settings."""
        extra: dict[str, Any] = {
            "name": str(settings.casper_x402_asset_name or "Wrapped CSPR"),
            "version": str(settings.casper_x402_asset_version or "1"),
            "decimals": str(settings.casper_x402_asset_decimals or "9"),
        }
        fee_payer = str(settings.casper_x402_fee_payer or "").strip()
        if fee_payer:
            extra["feePayer"] = fee_payer
        api_key = (
            str(settings.casper_x402_facilitator_api_key or "").strip()
            or str(settings.casper_cspr_cloud_api_key or "").strip()
        )
        amount = str(settings.casper_x402_amount or "").strip()
        # Back-compat: old "$0.001" style → 0.001 WCSPR atomic (9 decimals).
        if not amount or amount.startswith("$"):
            amount = "1000000"
        return CasperX402Config(
            facilitator_url=str(
                settings.casper_x402_facilitator_url or DEFAULT_FACILITATOR_URL
            ).rstrip("/"),
            network=str(settings.casper_x402_network or NETWORK_TESTNET),
            pay_to=str(settings.casper_x402_pay_to_address or "").strip(),
            asset=normalize_cep18_asset(str(settings.casper_x402_asset or DEFAULT_CEP18_ASSET)),
            amount=amount,
            description="OmniAgent Casper RWA collateral evidence proof",
            api_key=api_key,
            currency=str(settings.casper_x402_currency or "WCSPR"),
            extra=extra,
        )

    @staticmethod
    def setup_blockers(settings: Settings) -> list[str]:
        cfg = CasperX402EvidenceEndpointService.config_from_settings(settings)
        blockers: list[str] = []
        if not cfg.pay_to:
            blockers.append("casper_x402_pay_to_address_missing")
        if not cfg.asset:
            blockers.append("casper_x402_asset_missing")
        if not str(settings.casper_x402_facilitator_url or "").strip():
            blockers.append("casper_x402_facilitator_url_missing")
        if not cfg.amount:
            blockers.append("casper_x402_amount_missing")
        if not cfg.network.startswith("casper:"):
            blockers.append("casper_x402_network_unsupported")
        if not cfg.api_key:
            blockers.append("casper_x402_facilitator_api_key_missing")
        return blockers

    @staticmethod
    def public_url(settings: Settings, request_url: str | None = None) -> str:
        return str(settings.casper_x402_evidence_url or request_url or X402_EVIDENCE_ROUTE_PATH)

    @staticmethod
    def setup_status(settings: Settings, request_url: str | None = None) -> dict[str, Any]:
        cfg = CasperX402EvidenceEndpointService.config_from_settings(settings)
        blockers = CasperX402EvidenceEndpointService.setup_blockers(settings)
        # Price tag can be emitted without API key; settlement cannot.
        tag_ready = cfg.configured
        settle_ready = cfg.settle_ready
        if tag_ready and not settle_ready:
            status = "setup_required"
        elif tag_ready and settle_ready:
            status = "ready"
        else:
            status = "setup_required"
        return {
            "network": "casper",
            "provider": "x402",
            "status": status,
            "endpoint": CasperX402EvidenceEndpointService.public_url(settings, request_url),
            "route": X402_EVIDENCE_ROUTE_PATH,
            "facilitatorUrl": cfg.facilitator_url,
            "paymentNetwork": cfg.network,
            "price": cfg.amount,
            "amount": cfg.amount,
            "currency": cfg.currency,
            "asset": cfg.asset,
            "payToConfigured": bool(cfg.pay_to),
            "settleReady": settle_ready,
            "hardBlockers": blockers,
        }

    @staticmethod
    def paid_evidence_payload(
        settings: Settings,
        request_url: str | None = None,
        *,
        settlement: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        public_proof = CasperPublicProofService.get_public_proof({})
        proof_bundle = CasperProofBundleService.get_live_proof_bundle({"limit": 10})
        decision = (
            proof_bundle.get("latestDecision")
            if isinstance(proof_bundle.get("latestDecision"), dict)
            else {}
        )
        evidence_bundle = (
            decision.get("evidenceBundle")
            if isinstance(decision.get("evidenceBundle"), dict)
            else {}
        )
        cfg = CasperX402EvidenceEndpointService.config_from_settings(settings)
        resource_url = CasperX402EvidenceEndpointService.public_url(settings, request_url)
        payload = {
            "network": "casper",
            "provider": "x402",
            "resource": "omniagent-rwa-collateral-evidence",
            "resourceUrl": resource_url,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "payment": {
                "facilitatorUrl": cfg.facilitator_url,
                "network": cfg.network,
                "price": cfg.amount,
                "amount": cfg.amount,
                "currency": cfg.currency,
                "asset": cfg.asset,
                "payTo": cfg.pay_to,
            },
            "settlement": settlement,
            "binding": {
                "resourceUrl": resource_url,
                "sourceHash": public_proof.get("sourceHash"),
                "proofDigest": public_proof.get("proofDigest"),
                "decisionId": public_proof.get("decisionId"),
            },
            "receiptBindingHint": {
                "provider": "x402",
                "resourceUrl": resource_url,
                "amount": cfg.amount,
                "currency": cfg.currency,
                "network": cfg.network,
                "seller": cfg.pay_to,
                "sourceHash": public_proof.get("sourceHash"),
                "settlementTxHash": (settlement or {}).get("transaction"),
            },
            "evidenceBundle": evidence_bundle,
            "publicProof": public_proof,
        }
        CasperPublicProofService.assert_public_safe(payload)
        return payload

    @staticmethod
    def register_payment_middleware(app: FastAPI, settings: Settings) -> bool:
        """No-op: Casper x402 is enforced in the route, not EVM middleware.

        Kept for call-site compatibility with ``create_app``.
        """
        blockers = CasperX402EvidenceEndpointService.setup_blockers(settings)
        if blockers:
            logger.info("x402_casper_paywall_setup_incomplete", blockers=blockers)
            return False
        logger.info(
            "x402_casper_paywall_ready",
            route=X402_EVIDENCE_ROUTE_PATTERN,
            network=settings.casper_x402_network,
            facilitator=settings.casper_x402_facilitator_url,
        )
        return True
