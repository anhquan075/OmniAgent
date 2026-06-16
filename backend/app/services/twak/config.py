import json
from dataclasses import dataclass
from ipaddress import ip_address
from urllib.parse import urlparse

from app.core.settings import get_settings

@dataclass(frozen=True)
class TrustWalletBridgeConfig:
    mode: str
    enabled: bool
    base_url: str | None
    api_key: str | None
    timeout_ms: int
    command: str
    access_id: str | None
    hmac_secret: str | None

class TrustWalletConfigService:
    @staticmethod
    def normalize_base_url(value: object) -> str | None:
        raw = str(value or "").strip().rstrip("/")
        if not raw:
            return None
        if urlparse(raw).scheme in {"http", "https"}:
            return raw
        parsed = urlparse(f"//{raw}")
        host = (parsed.hostname or "").lower()
        try:
            is_loopback = ip_address(host).is_loopback
        except ValueError:
            is_loopback = False
        local_or_private = (
            host == "localhost"
            or is_loopback
            or host.endswith(".railway.internal")
            or host.endswith(".internal")
        )
        scheme = "http" if local_or_private else "https"
        return f"{scheme}://{raw}"

    @staticmethod
    def get_trust_wallet_bridge_config() -> TrustWalletBridgeConfig:
        settings = get_settings()
        raw: dict[str, object] = {}
        if settings.trust_wallet_agent_kit_config:
            try:
                parsed = json.loads(settings.trust_wallet_agent_kit_config)
                raw = parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                raw = {}
        return TrustWalletBridgeConfig(
            mode=settings.trust_wallet_agent_kit_mode,
            enabled=settings.trust_wallet_agent_kit_mode != "disabled",
            base_url=TrustWalletConfigService.normalize_base_url(raw.get("baseUrl") or raw.get("base_url")),
            api_key=str(raw.get("apiKey") or raw.get("api_key") or "") or None,
            timeout_ms=int(raw.get("timeoutMs") or raw.get("timeout_ms") or 30_000),
            command=str(raw.get("command") or "twak"),
            access_id=settings.tw_access_id,
            hmac_secret=settings.tw_hmac_secret,
        )
