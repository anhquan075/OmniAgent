from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI
import structlog
from x402.http import FacilitatorConfig, HTTPFacilitatorClient, PaymentOption
from x402.http.middleware.fastapi import PaymentMiddlewareASGI
from x402.http.types import RouteConfig
from x402.mechanisms.evm.exact import ExactEvmServerScheme
from x402.schemas import Network
from x402.server import x402ResourceServer

from app.core.settings import Settings
from app.services.casper.proof_bundle import CasperProofBundleService
from app.services.casper.public_proof import CasperPublicProofService


logger = structlog.get_logger(__name__)

X402_EVIDENCE_ROUTE_PATH = "/api/x402/rwa-evidence"
X402_EVIDENCE_ROUTE_PATTERN = f"GET {X402_EVIDENCE_ROUTE_PATH}"


class CasperX402EvidenceEndpointService:
    @staticmethod
    def setup_blockers(settings: Settings) -> list[str]:
        blockers: list[str] = []
        if not str(settings.casper_x402_pay_to_address or "").strip():
            blockers.append("casper_x402_pay_to_address_missing")
        if not str(settings.casper_x402_facilitator_url or "").strip():
            blockers.append("casper_x402_facilitator_url_missing")
        if not str(settings.casper_x402_price or "").strip():
            blockers.append("casper_x402_price_missing")
        if not str(settings.casper_x402_network or "").startswith("eip155:"):
            blockers.append("casper_x402_network_unsupported")
        return blockers

    @staticmethod
    def public_url(settings: Settings, request_url: str | None = None) -> str:
        return str(settings.casper_x402_evidence_url or request_url or X402_EVIDENCE_ROUTE_PATH)

    @staticmethod
    def setup_status(settings: Settings, request_url: str | None = None) -> dict[str, Any]:
        blockers = CasperX402EvidenceEndpointService.setup_blockers(settings)
        return {
            "network": "casper",
            "provider": "x402",
            "status": "ready" if not blockers else "setup_required",
            "endpoint": CasperX402EvidenceEndpointService.public_url(settings, request_url),
            "route": X402_EVIDENCE_ROUTE_PATH,
            "facilitatorUrl": settings.casper_x402_facilitator_url,
            "paymentNetwork": settings.casper_x402_network,
            "price": settings.casper_x402_price,
            "currency": settings.casper_x402_currency,
            "payToConfigured": bool(str(settings.casper_x402_pay_to_address or "").strip()),
            "hardBlockers": blockers,
        }

    @staticmethod
    def paid_evidence_payload(settings: Settings, request_url: str | None = None) -> dict[str, Any]:
        public_proof = CasperPublicProofService.get_public_proof({})
        proof_bundle = CasperProofBundleService.get_live_proof_bundle({"limit": 10})
        decision = (
            proof_bundle.get("latestDecision")
            if isinstance(proof_bundle.get("latestDecision"), dict)
            else {}
        )
        evidence_bundle = (
            decision.get("evidenceBundle") if isinstance(decision.get("evidenceBundle"), dict) else {}
        )
        resource_url = CasperX402EvidenceEndpointService.public_url(settings, request_url)
        payload = {
            "network": "casper",
            "provider": "x402",
            "resource": "omniagent-rwa-collateral-evidence",
            "resourceUrl": resource_url,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "payment": {
                "facilitatorUrl": settings.casper_x402_facilitator_url,
                "network": settings.casper_x402_network,
                "price": settings.casper_x402_price,
                "currency": settings.casper_x402_currency,
                "payTo": settings.casper_x402_pay_to_address,
            },
            "binding": {
                "resourceUrl": resource_url,
                "sourceHash": public_proof.get("sourceHash"),
                "proofDigest": public_proof.get("proofDigest"),
                "decisionId": public_proof.get("decisionId"),
            },
            "receiptBindingHint": {
                "provider": "x402",
                "resourceUrl": resource_url,
                "amount": settings.casper_x402_price,
                "currency": settings.casper_x402_currency,
                "network": settings.casper_x402_network,
                "seller": settings.casper_x402_pay_to_address,
                "sourceHash": public_proof.get("sourceHash"),
            },
            "evidenceBundle": evidence_bundle,
            "publicProof": public_proof,
        }
        CasperPublicProofService.assert_public_safe(payload)
        return payload

    @staticmethod
    def register_payment_middleware(app: FastAPI, settings: Settings) -> bool:
        blockers = CasperX402EvidenceEndpointService.setup_blockers(settings)
        if blockers:
            logger.info("x402_evidence_paywall_disabled", blockers=blockers)
            return False

        network: Network = settings.casper_x402_network
        facilitator = HTTPFacilitatorClient(
            FacilitatorConfig(url=settings.casper_x402_facilitator_url)
        )
        server = x402ResourceServer(facilitator)
        server.register(network, ExactEvmServerScheme())
        routes = {
            X402_EVIDENCE_ROUTE_PATTERN: RouteConfig(
                accepts=PaymentOption(
                    scheme="exact",
                    pay_to=str(settings.casper_x402_pay_to_address),
                    price=settings.casper_x402_price,
                    network=network,
                ),
                resource=settings.casper_x402_evidence_url or X402_EVIDENCE_ROUTE_PATH,
                mime_type="application/json",
                description="OmniAgent Casper RWA collateral evidence proof",
                service_name="OmniAgent Casper evidence",
                tags=["casper", "rwa", "proof", "omniagent"],
            )
        }
        app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)
        logger.info(
            "x402_evidence_paywall_enabled",
            route=X402_EVIDENCE_ROUTE_PATTERN,
            network=network,
            price=settings.casper_x402_price,
        )
        return True
