from datetime import datetime, timezone
from typing import Any

from app.core.settings import get_settings
from app.services.agent.status import BnbAgentStatusService
from app.services.agent.types import ALLOWED_AGENT_URI_RE, BSC_ADDRESS_RE, BSC_TX_RE
from app.services.agent.types import BnbAgentTypeService
from app.services.shared.ledger import TradeLedger
from app.services.wallet.agent_wallet import AgentWalletService

class BnbAgentIdentityService:
    @staticmethod
    async def register_agent_identity(args: dict[str, object]) -> dict[str, object]:
        settings = get_settings()
        wallet_address = BnbAgentIdentityService._requested_wallet_address(args)
        agent_uri, uri_metadata = BnbAgentIdentityService._resolve_agent_uri(args)
        status = BnbAgentStatusService.get_agent_sdk_status_dict()
        dry_run = not bool(args.get("submit"))
        proof: dict[str, object] = {
            "network": "bsc",
            "chainId": settings.bnb_chain_id,
            "status": "dry_run" if dry_run else "blocked",
            "submitted": False,
            "agentWallet": wallet_address,
            "agentUri": agent_uri,
            "agentUriPreview": agent_uri[:96] + "..." if len(agent_uri) > 96 else agent_uri,
            "agentUriGenerated": uri_metadata["generated"],
            "registryAddress": status.get("registryAddress"),
            "sdkStatus": status,
            "reason": "Dry run only; no BNB Agent SDK transaction submitted.",
        }
        blocker = BnbAgentIdentityService._registration_blocker(settings, wallet_address)
        if dry_run or blocker:
            return proof if dry_run else {**proof, "reason": blocker}
        result = BnbAgentIdentityService._submit_agent_registration(
            agent_uri=agent_uri,
            private_key=str(settings.private_key),
            wallet_password=str(settings.wallet_password),
            network=settings.bnb_agent_sdk_network,
        )
        normalized = BnbAgentIdentityService._normalize_registration_result(result, wallet_address, status.get("registryAddress"))
        TradeLedger.append_event({
            "eventType": "agent_registered",
            "createdAt": normalized["timestamp"],
            "txHash": normalized["transactionHash"],
            "payload": normalized,
        })
        return {**proof, **normalized, "status": "submitted", "submitted": True, "reason": "BNB Agent SDK identity registration submitted."}

    @staticmethod
    def _registration_blocker(settings: object, wallet_address: str) -> str | None:
        if not settings.bnb_agent_sdk_enabled:
            return "BNB_AGENT_SDK_ENABLED is false."
        if not settings.bnb_agent_sdk_registration_enabled:
            return "BNB_AGENT_SDK_REGISTRATION_ENABLED is false."
        if settings.bnb_agent_sdk_network != "bsc-mainnet":
            return "BNB Agent SDK registration only supports bsc-mainnet."
        if not settings.private_key or not settings.wallet_password:
            return "PRIVATE_KEY and WALLET_PASSWORD are required for live SDK registration."
        signer_address = BnbAgentTypeService.derive_private_key_address(settings.private_key)
        if signer_address and signer_address.lower() != wallet_address.lower():
            return "Requested wallet does not match the SDK signer wallet."
        return None

    @staticmethod
    def _requested_wallet_address(args: dict[str, object]) -> str:
        requested = str(args.get("walletAddress") or "")
        configured = str(AgentWalletService.get_wallet_data().get("walletAddress") or "")
        wallet_address = requested or configured
        if not BSC_ADDRESS_RE.match(wallet_address):
            raise ValueError("A valid BSC agent wallet is required.")
        return wallet_address

    @staticmethod
    def _resolve_agent_uri(args: dict[str, object]) -> tuple[str, dict[str, object]]:
        provided_uri = str(args.get("agentUri") or "").strip()
        if provided_uri:
            if not ALLOWED_AGENT_URI_RE.match(provided_uri):
                raise ValueError("agentUri must be a BNB SDK data URI or an https:// URI.")
            return provided_uri, {"generated": False}
        return BnbAgentIdentityService._generate_agent_uri(args), {"generated": True}

    @staticmethod
    def _generate_agent_uri(args: dict[str, object]) -> str:
        try:
            from bnbagent.erc8004.agent_uri import AgentURIGenerator
            from bnbagent.erc8004.models import AgentEndpoint
        except Exception as exc:
            raise ValueError(f"Unable to import BNB Agent SDK URI generator: {exc}") from exc
        settings = get_settings()
        return AgentURIGenerator.generate_agent_uri(
            name=str(args.get("name") or "OmniAgent BNB Trader"),
            description=str(args.get("description") or "Autonomous Track 1 agent that reads CMC signals and executes guarded BSC trades through TWAK."),
            endpoints=BnbAgentIdentityService._endpoint_models(args, AgentEndpoint),
            image=str(args.get("image") or ""),
            identity_registry=BnbAgentTypeService.registry_address(settings.bnb_agent_sdk_network),
            chain_id=settings.bnb_chain_id,
            supported_trust=["self-custody", "twak-local-signing", "x402"],
        )

    @staticmethod
    def _endpoint_models(args: dict[str, object], endpoint_class: Any) -> list[object]:
        settings = get_settings()
        raw_endpoints = args.get("endpoints")
        endpoint_rows = raw_endpoints if isinstance(raw_endpoints, list) else [{
            "name": "MCP",
            "endpoint": str(args.get("endpoint") or settings.bnb_agent_public_endpoint),
            "version": "1.0.0",
            "capabilities": ["cmc-signal", "twak-signing", "guarded-bsc-trading"],
        }]
        endpoints = []
        for item in endpoint_rows:
            if not isinstance(item, dict):
                raise ValueError("endpoints must contain objects with name and endpoint.")
            endpoints.append(endpoint_class.from_dict(item))
        return endpoints

    @staticmethod
    def _submit_agent_registration(agent_uri: str, private_key: str, wallet_password: str, network: str) -> dict[str, Any]:
        try:
            from bnbagent import ERC8004Agent, EVMWalletProvider
        except Exception as exc:
            raise ValueError(f"Unable to import bnbagent: {exc}") from exc
        wallet = EVMWalletProvider(password=wallet_password, private_key=private_key, persist=False)
        result = ERC8004Agent(wallet_provider=wallet, network=network).register_agent(agent_uri=agent_uri)
        if not isinstance(result, dict):
            raise ValueError("bnbagent register_agent did not return a JSON object.")
        return result

    @staticmethod
    def _normalize_registration_result(result: dict[str, Any], requested_wallet: str, fallback_registry_address: object) -> dict[str, object]:
        tx_hash = BnbAgentTypeService.optional_string(result.get("transactionHash") or result.get("txHash") or result.get("hash"))
        agent_id = BnbAgentTypeService.optional_string(result.get("agentId") or result.get("agentID") or result.get("id"))
        registry = BnbAgentTypeService.optional_string(result.get("registryAddress") or result.get("identityRegistryAddress") or result.get("agentRegistry") or fallback_registry_address)
        agent_wallet = BnbAgentTypeService.optional_string(result.get("agentWallet") or result.get("walletAddress") or requested_wallet)
        if not tx_hash or not BSC_TX_RE.match(tx_hash):
            raise ValueError("BNB Agent SDK transactionHash is not a valid BSC transaction hash.")
        if not agent_id:
            raise ValueError("BNB Agent SDK did not return agentId.")
        if not registry or not BSC_ADDRESS_RE.match(registry):
            raise ValueError("BNB Agent SDK registryAddress is not a valid BSC address.")
        if not agent_wallet or agent_wallet.lower() != requested_wallet.lower():
            raise ValueError("BNB Agent SDK agentWallet does not match the requested BSC wallet.")
        return {
            "agentId": agent_id,
            "agentWallet": agent_wallet,
            "registryAddress": registry,
            "transactionHash": tx_hash,
            "explorerUrl": f"{get_settings().bnb_explorer_url}/tx/{tx_hash}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
