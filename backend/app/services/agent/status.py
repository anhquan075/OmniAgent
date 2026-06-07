from dataclasses import asdict

from app.core.settings import get_settings
from app.services.agent.types import AgentSdkStatus
from app.services.agent.types import BnbAgentTypeService

class BnbAgentStatusService:
    @staticmethod
    def get_agent_sdk_status() -> AgentSdkStatus:
        settings = get_settings()
        installed = BnbAgentTypeService.bnbagent_installed()
        ready = settings.bnb_agent_sdk_enabled and installed and settings.bnb_agent_sdk_network == "bsc-mainnet"
        reason = None
        if not settings.bnb_agent_sdk_enabled:
            reason = "BNB_AGENT_SDK_ENABLED is false"
        elif not installed:
            reason = "Python package bnbagent is not installed"
        elif settings.bnb_agent_sdk_network != "bsc-mainnet":
            reason = "BNB Agent SDK network must be bsc-mainnet"
        return AgentSdkStatus(
            enabled=settings.bnb_agent_sdk_enabled,
            installed=installed,
            ready=ready,
            package="bnbagent",
            network=settings.bnb_agent_sdk_network,
            mode="fastapi",
            version=BnbAgentTypeService.package_version() if installed else None,
            registryAddress=BnbAgentTypeService.registry_address(settings.bnb_agent_sdk_network) if installed else None,
            walletAddress=BnbAgentTypeService.derive_private_key_address(settings.private_key),
            privateKeyConfigured=bool(settings.private_key),
            walletPasswordConfigured=bool(settings.wallet_password),
            registrationEnabled=settings.bnb_agent_sdk_registration_enabled,
            reason=reason,
        )

    @staticmethod
    def get_agent_sdk_status_dict() -> dict[str, object]:
        return asdict(BnbAgentStatusService.get_agent_sdk_status())
