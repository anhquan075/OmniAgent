from datetime import datetime, timezone
import re

from app.core.settings import get_settings
from app.services.shared.ledger import TradeLedger
from app.services.twak.config import TrustWalletConfigService
from app.services.wallet.agent_wallet import AgentWalletService

PAID_RESOURCE_IDS = {"cmc_agent_hub", "cmc_skill_hub", "twak_x402"}
TX_HASH_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")

class X402PaymentService:
    @staticmethod
    def get_paid_resource_status(limit: int = 20) -> dict[str, object]:
        settings = get_settings()
        ledger = TradeLedger.get_ledger_summary(limit=limit)
        twak_config = TrustWalletConfigService.get_trust_wallet_bridge_config()
        cmc_agent_ready = bool(settings.cmc_agent_hub_api_key)
        cmc_skill_ready = bool(settings.cmc_skill_hub_key)
        twak_credentials_ready = bool(settings.tw_access_id and settings.tw_hmac_secret and twak_config.enabled)
        verifier_ready = bool(settings.x402_payment_verifier_url)
        x402_configured = bool(settings.robot_fleet_x402_enabled and settings.x402_facilitator_url and twak_credentials_ready)
        ready = bool(x402_configured and verifier_ready)
        resources = [
            {
                "id": "cmc_agent_hub",
                "label": "CMC Agent Hub market data",
                "configured": cmc_agent_ready,
                "payPerUse": False,
                "endpoint": settings.cmc_skill_hub_mcp_url,
                "reason": "CMC Agent Hub API key is configured." if cmc_agent_ready else "CMC_AGENT_HUB_API_KEY is missing.",
            },
            {
                "id": "cmc_skill_hub",
                "label": "CMC Skill Hub strategy tools",
                "configured": cmc_skill_ready,
                "payPerUse": True,
                "endpoint": settings.cmc_agent_hub_base_url,
                "reason": (
                    "CMC Skill Hub can use configured CMC credentials."
                    if cmc_skill_ready else "CMC_SKILL_HUB_API_KEY or CMC_AGENT_HUB_API_KEY is missing."
                ),
            },
            {
                "id": "twak_x402",
                "label": "TWAK native x402 payment rail",
                "configured": x402_configured,
                "payPerUse": True,
                "endpoint": settings.x402_facilitator_url,
                "reason": X402PaymentService.x402_reason(x402_configured, verifier_ready, twak_config.enabled),
            },
        ]
        return {
            "network": "bsc",
            "chainId": settings.bnb_chain_id,
            "ready": ready,
            "x402Configured": x402_configured,
            "paymentVerifierConfigured": verifier_ready,
            "claimStatus": "ready_for_verified_demo" if ready else "not_claimed",
            "networkId": settings.x402_network,
            "resources": resources,
            "missingEnv": X402PaymentService.missing_env(resources, x402_configured, verifier_ready),
            "recentEvents": [
                event for event in ledger.get("events", [])
                if event.get("eventType") in {"paid_resource_accessed", "paid_resource_failed"}
            ],
        }

    @staticmethod
    def record_paid_signal_access(args: dict[str, object]) -> dict[str, object]:
        status = X402PaymentService.get_paid_resource_status(limit=50)
        resource = X402PaymentService.parse_resource(args.get("resource"))
        tx_hash = str(args.get("txHash") or "")
        has_payment_proof = bool(TX_HASH_RE.match(tx_hash))
        ready = bool(status["ready"])
        event_type = "paid_resource_accessed" if ready and has_payment_proof else "paid_resource_failed"
        wallet = AgentWalletService.get_wallet_data()
        event = TradeLedger.append_event({
            "eventType": event_type,
            "action": resource,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "txHash": tx_hash if has_payment_proof else None,
            "payload": {
                "resource": resource,
                "walletAddress": args.get("walletAddress") or wallet.get("walletAddress"),
                "amountUsd": args.get("amountUsd") if isinstance(args.get("amountUsd"), int | float) else None,
                "requestId": args.get("requestId"),
                "x402Configured": status["x402Configured"],
                "paymentVerifierConfigured": status["paymentVerifierConfigured"],
                "reason": X402PaymentService.payment_reason(status, has_payment_proof),
            },
        })
        return {
            "network": "bsc",
            "recorded": True,
            "verified": event_type == "paid_resource_accessed",
            "event": event,
            "paidStatus": X402PaymentService.get_paid_resource_status(limit=10),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def x402_reason(configured: bool, verifier_ready: bool, twak_enabled: bool) -> str:
        if not twak_enabled:
            return "TWAK mode is disabled, so native x402 cannot run in the trade loop."
        if not configured:
            return "ROBOT_FLEET_X402_ENABLED, X402_FACILITATOR_URL, TW_ACCESS_ID, or TW_HMAC_SECRET is missing."
        if not verifier_ready:
            return "x402 credentials are present, but no trusted X402_PAYMENT_VERIFIER_URL is configured."
        return "x402 rail and trusted verifier are configured."

    @staticmethod
    def payment_reason(status: dict[str, object], has_payment_proof: bool) -> str:
        if not status["x402Configured"]:
            return "x402 is not configured for paid-resource proof."
        if not has_payment_proof:
            return "A valid x402 payment transaction hash is required before verification can run."
        if not status["paymentVerifierConfigured"]:
            return "Payment hash was recorded, but no trusted x402 verifier is configured."
        return "x402 payment proof verified through the configured verifier."

    @staticmethod
    def parse_resource(value: object) -> str:
        return str(value) if str(value) in PAID_RESOURCE_IDS else "cmc_agent_hub"

    @staticmethod
    def missing_env(resources: list[dict[str, object]], x402_configured: bool, verifier_ready: bool) -> list[str]:
        missing = [
            "CMC_AGENT_HUB_API_KEY" if resource["id"] == "cmc_agent_hub"
            else "CMC_SKILL_HUB_API_KEY" if resource["id"] == "cmc_skill_hub"
            else "ROBOT_FLEET_X402_ENABLED/X402_FACILITATOR_URL/TW_ACCESS_ID/TW_HMAC_SECRET"
            for resource in resources
            if not resource["configured"]
        ]
        if not x402_configured:
            missing.extend(["ROBOT_FLEET_X402_ENABLED", "X402_FACILITATOR_URL", "TW_ACCESS_ID", "TW_HMAC_SECRET"])
        if not verifier_ready:
            missing.append("X402_PAYMENT_VERIFIER_URL")
        return sorted(set(missing))
