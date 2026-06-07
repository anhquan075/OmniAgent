import re
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version
from importlib.util import find_spec

BSC_TX_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")
BSC_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
ALLOWED_AGENT_URI_RE = re.compile(
    r"^data:application/json;base64,[A-Za-z0-9+/=]+$"
    r"|^https://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$"
)

@dataclass
class AgentSdkStatus:
    enabled: bool
    installed: bool
    ready: bool
    package: str
    network: str
    mode: str
    version: str | None = None
    registryAddress: str | None = None
    walletAddress: str | None = None
    privateKeyConfigured: bool = False
    walletPasswordConfigured: bool = False
    registrationEnabled: bool = False
    reason: str | None = None

class BnbAgentTypeService:
    @staticmethod
    def bnbagent_installed() -> bool:
        return find_spec("bnbagent") is not None

    @staticmethod
    def registry_address(network: str) -> str | None:
        try:
            from bnbagent.erc8004.agent import get_erc8004_config
            return get_erc8004_config(network).get("registry_contract")
        except Exception:
            return None

    @staticmethod
    def derive_private_key_address(private_key: str | None) -> str | None:
        if not private_key:
            return None
        try:
            from eth_account import Account
            return str(Account.from_key(private_key).address)
        except Exception:
            return None

    @staticmethod
    def package_version() -> str | None:
        try:
            return version("bnbagent")
        except PackageNotFoundError:
            return None

    @staticmethod
    def optional_string(value: object) -> str | None:
        if value is None:
            return None
        text = str(value)
        return text if text else None
