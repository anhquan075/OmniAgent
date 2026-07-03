from pathlib import Path
from typing import Any

from app.core.settings import get_settings


class CasperAccountService:
    @staticmethod
    def get_account(_: dict[str, Any] | None = None) -> dict[str, Any]:
        settings = get_settings()
        public_key = (settings.casper_account_public_key or "").strip()
        secret_path = CasperAccountService.secret_key_path()
        return {
            "network": "casper",
            "chain": settings.casper_network,
            "rpcUrl": settings.casper_rpc_url,
            "explorerUrl": settings.casper_explorer_url,
            "configured": bool(public_key),
            "publicKey": public_key or None,
            "accountExplorerUrl": (
                f"{settings.casper_explorer_url.rstrip('/')}/account/{public_key}" if public_key else None
            ),
            "signer": {
                "configured": bool(settings.casper_secret_key_path),
                "pathExists": bool(secret_path and secret_path.exists()),
            },
            "contract": {
                "hash": settings.casper_decision_contract_hash or None,
                "packageHash": settings.casper_decision_contract_package_hash or None,
            },
            "liveSubmitEnabled": settings.casper_live_submit_enabled,
        }

    @staticmethod
    def secret_key_path() -> Path | None:
        raw_path = get_settings().casper_secret_key_path
        if not raw_path:
            return None
        return Path(raw_path).expanduser()
