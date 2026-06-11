from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.settings import get_settings
from app.services.trading.registration import CompetitionRegistrationService
from app.services.trading.registration import TX_RE
from app.services.trading.registration_rpc_status import CompetitionRegistrationRpcStatusService
from app.services.twak.cli import TrustWalletCliClient
from app.services.twak.config import TrustWalletConfigService
from app.services.twak.rest import TrustWalletRestClient


class CompetitionRegistrationStatusService:
    @staticmethod
    async def get_competition_status(wallet_address: str | None = None) -> dict[str, object] | None:
        twak_status = await CompetitionRegistrationStatusService.get_twak_competition_status()
        if wallet_address:
            rpc_status = await CompetitionRegistrationRpcStatusService.get_rpc_competition_status(wallet_address)
            if CompetitionRegistrationStatusService.status_registration_proof(wallet_address, rpc_status):
                return rpc_status
            if not twak_status or twak_status.get("ready") is False:
                return rpc_status or twak_status
        return twak_status

    @staticmethod
    async def get_twak_competition_status() -> dict[str, object] | None:
        bridge = TrustWalletConfigService.get_trust_wallet_bridge_config()
        if bridge.mode == "rest" and bridge.base_url:
            try:
                status = await TrustWalletRestClient.call_rest_action(
                    bridge.base_url,
                    bridge.api_key,
                    bridge.hmac_secret,
                    "competition_status",
                    {},
                    bridge.timeout_ms / 1000,
                )
            except (httpx.HTTPError, ValueError, TypeError) as error:
                return {"ready": False, "registered": False, "reason": str(error)}
            return status if "_error" not in status else {"ready": False, "reason": status["_error"]}
        if bridge.mode == "cli":
            try:
                status = await TrustWalletCliClient.get_cli_competition_status(
                    bridge.command,
                    bridge.timeout_ms / 1000,
                )
            except (RuntimeError, OSError, ValueError, TypeError) as error:
                return {"ready": False, "registered": False, "reason": str(error)}
            return status if "_error" not in status else {"ready": False, "reason": status["_error"]}
        return None

    @staticmethod
    def current_registration_proof(
        wallet_address: str | None = None,
        competition_status: dict[str, object] | None = None,
    ) -> dict[str, object] | None:
        status_proof = CompetitionRegistrationStatusService.status_registration_proof(
            wallet_address,
            competition_status,
        )
        if status_proof:
            return status_proof
        if competition_status is not None and competition_status.get("ready") is not False:
            return None
        return CompetitionRegistrationService.stored_registration_proof(wallet_address)

    @staticmethod
    def is_registered(
        wallet_address: str | None = None,
        competition_status: dict[str, object] | None = None,
    ) -> bool:
        return CompetitionRegistrationStatusService.current_registration_proof(
            wallet_address,
            competition_status,
        ) is not None

    @staticmethod
    def status_registration_proof(
        wallet_address: str | None,
        status: dict[str, object] | None,
    ) -> dict[str, object] | None:
        if not isinstance(status, dict) or status.get("_error") or status.get("ready") is False:
            return None
        if not CompetitionRegistrationStatusService.truthy_registered(status.get("registered")):
            return None
        settings = get_settings()
        expected_wallet = str(wallet_address or "")
        participant = CompetitionRegistrationStatusService.first_text(
            status,
            ("participant", "walletAddress", "agentWallet", "address"),
        )
        if expected_wallet and not participant:
            return None
        if participant and expected_wallet and not CompetitionRegistrationService.same_address(
            participant,
            expected_wallet,
        ):
            return None
        contract = CompetitionRegistrationStatusService.first_text(
            status,
            ("competitionContractAddress", "contractAddress"),
        )
        if contract and not CompetitionRegistrationService.same_address(
            contract,
            settings.bnb_competition_contract_address,
        ):
            return None
        chain_id = CompetitionRegistrationStatusService.chain_id(status)
        if chain_id is not None and chain_id != settings.bnb_chain_id:
            return None
        tx_hash = CompetitionRegistrationStatusService.valid_tx_hash(status.get("txHash") or status.get("hash"))
        explorer = settings.bnb_explorer_url.rstrip("/")
        return {
            "source": status.get("source") or "competition-status",
            "eventType": "competition_registered",
            "registered": True,
            "status": status.get("status") or "registered",
            "txHash": tx_hash,
            "explorerUrl": f"{explorer}/tx/{tx_hash}" if tx_hash else None,
            "walletAddress": participant or expected_wallet or None,
            "competitionContractAddress": contract or settings.bnb_competition_contract_address,
            "chainId": chain_id or settings.bnb_chain_id,
            "checkedAt": datetime.now(timezone.utc).isoformat(),
            "statusProof": {
                "valid": True,
                "source": status.get("source") or "competition_status",
                "registered": True,
                "blockNumber": status.get("blockNumber"),
                "eventTopic": status.get("eventTopic"),
            },
        }

    @staticmethod
    def truthy_registered(value: object) -> bool:
        return value is True or str(value).strip().lower() in {"true", "registered", "yes"}

    @staticmethod
    def first_text(payload: dict[str, object], keys: tuple[str, ...]) -> str | None:
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
        return None

    @staticmethod
    def chain_id(status: dict[str, object]) -> int | None:
        value = status.get("chainId")
        if value is None:
            return None
        try:
            return int(str(value))
        except ValueError:
            return None

    @staticmethod
    def valid_tx_hash(value: Any) -> str | None:
        text = str(value or "")
        return text if TX_RE.match(text) else None
