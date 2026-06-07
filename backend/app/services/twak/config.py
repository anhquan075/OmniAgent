import json
from dataclasses import dataclass

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
            base_url=str(raw.get("baseUrl") or raw.get("base_url") or "").rstrip("/") or None,
            api_key=str(raw.get("apiKey") or raw.get("api_key") or "") or None,
            timeout_ms=int(raw.get("timeoutMs") or raw.get("timeout_ms") or 30_000),
            command=str(raw.get("command") or "twak"),
            access_id=settings.tw_access_id,
            hmac_secret=settings.tw_hmac_secret,
        )
