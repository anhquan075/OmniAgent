import re
from datetime import datetime, timezone

from app.core.settings import get_settings
from app.services.shared.ledger import TradeLedger
from app.services.trading.bundled_registration_proof import BundledRegistrationProof
from app.services.twak.config import TrustWalletConfigService
from app.services.twak.cli import TrustWalletCliClient
from app.services.twak.rest import TrustWalletRestClient
from app.services.wallet.agent_wallet import AgentWalletService
ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
TX_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")
URI_RE = re.compile(r"^(ipfs://[A-Za-z0-9._:/-]+|https://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+)$")
class CompetitionRegistrationService:
    @staticmethod
    def build_registration_instructions(wallet_address: str, metadata_uri: str) -> dict[str, object]:
        settings = get_settings()
        CompetitionRegistrationService.validate_registration_input(wallet_address, metadata_uri)
        manual_command_args = ["twak", "compete", "register"]
        return {
            "network": "bsc",
            "chainId": settings.bnb_chain_id,
            "walletAddress": wallet_address,
            "competitionContractAddress": settings.bnb_competition_contract_address,
            "metadataUri": metadata_uri,
            "submitted": False,
            "status": "instructions_only",
            "manualCommand": " ".join(manual_command_args),
            "manualCommandArgs": manual_command_args,
            "note": "Registration is complete once TWAK returns a BSC txHash or live contract status verifies the agent wallet.",
        }

    @staticmethod
    async def register_competition(args: dict[str, object]) -> dict[str, object]:
        settings = get_settings()
        wallet = AgentWalletService.get_wallet_data()
        wallet_address = str(args.get("walletAddress") or wallet.get("walletAddress") or "")
        metadata_uri = str(args.get("metadataUri") or "ipfs://omniagent")
        submit = bool(args.get("submit") or False)
        instructions = CompetitionRegistrationService.build_registration_instructions(wallet_address, metadata_uri)
        if not submit:
            return instructions
        if not settings.bnb_competition_registration_enabled:
            return {**instructions, "status": "blocked", "reason": "BNB_COMPETITION_REGISTRATION_ENABLED is false"}

        bridge = TrustWalletConfigService.get_trust_wallet_bridge_config()
        if bridge.mode == "rest":
            proof = await CompetitionRegistrationService.register_via_rest(wallet_address, metadata_uri)
        elif bridge.mode == "cli":
            proof = await CompetitionRegistrationService.register_via_cli(wallet_address, metadata_uri)
        else:
            return {**instructions, "status": "blocked", "reason": "TWAK mode must be rest or cli"}
        if proof.get("txHash"):
            TradeLedger.append_event({
                "eventType": "competition_registered",
                "txHash": proof["txHash"],
                "payload": proof,
                "createdAt": datetime.now(timezone.utc).isoformat(),
            })
        return proof

    @staticmethod
    async def register_via_rest(wallet_address: str, metadata_uri: str) -> dict[str, object]:
        bridge = TrustWalletConfigService.get_trust_wallet_bridge_config()
        if not bridge.base_url:
            raise ValueError("TRUST_WALLET_AGENT_KIT_CONFIG must include baseUrl for TWAK REST registration.")
        status = await TrustWalletRestClient.call_rest_action(
            bridge.base_url,
            bridge.api_key,
            bridge.hmac_secret,
            "competition_status",
            {},
            bridge.timeout_ms / 1000,
        )
        if status.get("registered") and CompetitionRegistrationService.same_address(status.get("participant"), wallet_address):
            return CompetitionRegistrationService.build_status_proof(wallet_address, metadata_uri, status, "rest")
        payload = await TrustWalletRestClient.call_rest_action(
            bridge.base_url,
            bridge.api_key,
            bridge.hmac_secret,
            "competition_register",
            {},
            bridge.timeout_ms / 1000,
        )
        tx_hash = payload.get("txHash") or payload.get("hash")
        return CompetitionRegistrationService.build_registration_proof(wallet_address, metadata_uri, str(tx_hash or ""), "rest")

    @staticmethod
    async def register_via_cli(wallet_address: str, metadata_uri: str) -> dict[str, object]:
        bridge = TrustWalletConfigService.get_trust_wallet_bridge_config()
        status = await TrustWalletCliClient.get_cli_competition_status(bridge.command, bridge.timeout_ms / 1000)
        if status.get("registered") and CompetitionRegistrationService.same_address(status.get("participant"), wallet_address):
            return CompetitionRegistrationService.build_status_proof(wallet_address, metadata_uri, status, "cli")
        payload = await TrustWalletCliClient.register_cli_competition(bridge.command, bridge.timeout_ms / 1000)
        tx_hash = TrustWalletCliClient.find_tx_hash(payload) or ""
        return CompetitionRegistrationService.build_registration_proof(wallet_address, metadata_uri, tx_hash, "cli")

    @staticmethod
    def build_status_proof(
        wallet_address: str,
        metadata_uri: str,
        status: dict[str, object],
        bridge_mode: str,
    ) -> dict[str, object]:
        settings = get_settings()
        CompetitionRegistrationService.validate_registration_input(wallet_address, metadata_uri)
        return {
            "network": "bsc",
            "chainId": settings.bnb_chain_id,
            "walletAddress": wallet_address,
            "competitionContractAddress": settings.bnb_competition_contract_address,
            "metadataUri": metadata_uri,
            "submitted": False,
            "status": "already_registered_external",
            "registered": True,
            "ledgerProofStored": False,
            "ledgerProofRequired": False,
            "reason": "TWAK reports this wallet is already registered; live execution can use contract status proof.",
            "participant": status.get("participant"),
            "deadline": status.get("deadline"),
            "bridgeMode": bridge_mode,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def build_registration_proof(
        wallet_address: str,
        metadata_uri: str,
        tx_hash: str,
        bridge_mode: str,
    ) -> dict[str, object]:
        settings = get_settings()
        CompetitionRegistrationService.validate_registration_input(wallet_address, metadata_uri)
        if not TX_RE.match(tx_hash):
            raise ValueError("A valid BSC transaction hash is required for registration proof.")
        explorer = settings.bnb_explorer_url.rstrip("/")
        return {
            "network": "bsc",
            "chainId": settings.bnb_chain_id,
            "walletAddress": wallet_address,
            "competitionContractAddress": settings.bnb_competition_contract_address,
            "metadataUri": metadata_uri,
            "submitted": True,
            "status": "submitted",
            "txHash": tx_hash,
            "explorerUrl": f"{explorer}/tx/{tx_hash}",
            "bridgeMode": bridge_mode,
            "receiptProof": {
                "valid": False,
                "reasons": ["receipt_not_validated"],
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def stored_registration_proof(wallet_address: str | None = None) -> dict[str, object] | None:
        settings = get_settings()
        expected_wallet = str(wallet_address or AgentWalletService.get_wallet_data().get("walletAddress") or "")
        bundled = BundledRegistrationProof.events() if settings.bnb_bundled_registration_proof_enabled else []
        events = [*bundled, *TradeLedger._read_events(settings.trade_ledger_path)]
        for event in reversed(events):
            if not isinstance(event, dict) or event.get("eventType") != "competition_registered":
                continue
            payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
            tx_hash = str(event.get("txHash") or payload.get("txHash") or "")
            contract_address = str(payload.get("competitionContractAddress") or "")
            chain_id = int(payload.get("chainId") or 0)
            proof_wallet = str(payload.get("walletAddress") or "")
            if not TX_RE.match(tx_hash):
                continue
            if expected_wallet and not CompetitionRegistrationService.same_address(proof_wallet, expected_wallet):
                continue
            if not CompetitionRegistrationService.same_address(contract_address, settings.bnb_competition_contract_address):
                continue
            if chain_id != settings.bnb_chain_id:
                continue
            if not CompetitionRegistrationService.registration_receipt_valid(payload):
                continue
            return event
        return None

    @staticmethod
    def has_stored_registration_proof(wallet_address: str | None = None) -> bool:
        return CompetitionRegistrationService.stored_registration_proof(wallet_address) is not None

    @staticmethod
    def registration_receipt_valid(payload: dict[str, object]) -> bool:
        receipt_proof = payload.get("receiptProof")
        return isinstance(receipt_proof, dict) and receipt_proof.get("valid") is True

    @staticmethod
    def validate_registration_input(wallet_address: str, metadata_uri: str) -> None:
        if not ADDRESS_RE.match(wallet_address):
            raise ValueError("A valid BSC wallet address is required for registration.")
        if not URI_RE.match(metadata_uri):
            raise ValueError("metadataUri must be an ipfs:// or https:// URI.")

    @staticmethod
    def same_address(left: object, right: object) -> bool:
        return isinstance(left, str) and isinstance(right, str) and left.lower() == right.lower()
