from hashlib import blake2b
from pathlib import Path
from typing import Any

from app.core.settings import get_settings


class CasperAccountService:
    @staticmethod
    def get_account(_: dict[str, Any] | None = None) -> dict[str, Any]:
        settings = get_settings()
        public_key = (settings.casper_account_public_key or "").strip()
        secret_path = CasperAccountService.secret_key_path()
        account_hash = CasperAccountService.account_hash_from_public_key(public_key)
        return {
            "network": "casper",
            "chain": settings.casper_network,
            "rpcUrl": settings.casper_rpc_url,
            "explorerUrl": settings.casper_explorer_url,
            "configured": bool(public_key),
            "publicKey": public_key or None,
            "accountHash": account_hash,
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

    @staticmethod
    def account_hash_from_public_key(public_key: str | None) -> str | None:
        """Derive the Casper account-hash hex from a tagged public-key hex.

        Casper ``AccountHash::from_public_key`` hashes:

            ascii(algorithm_name) || 0x00 || raw_public_key_bytes

        where ``raw_public_key_bytes`` excludes the algorithm tag byte that
        prefixes ``CASPER_ACCOUNT_PUBLIC_KEY`` hex (``01`` ed25519 / ``02`` secp256k1).
        """
        raw = (public_key or "").strip().removeprefix("0x")
        if len(raw) < 66 or len(raw) % 2 != 0:
            return None
        try:
            payload = bytes.fromhex(raw)
        except ValueError:
            return None
        if payload[0] == 1:
            algorithm = b"ed25519"
        elif payload[0] == 2:
            algorithm = b"secp256k1"
        else:
            return None
        if len(payload) < 33:
            return None
        preimage = algorithm + b"\x00" + payload[1:]
        return blake2b(preimage, digest_size=32).hexdigest()

    @staticmethod
    def normalize_account_hash(value: str | None) -> str | None:
        """Return bare lowercase 64-hex account hash, or None if invalid."""
        raw = (value or "").strip()
        if raw.lower().startswith("account-hash-"):
            raw = raw[len("account-hash-") :]
        if raw.startswith("00") and len(raw) == 66 and all(
            c in "0123456789abcdefABCDEF" for c in raw
        ):
            # CEP-18 payee form: 00 || account-hash
            raw = raw[2:]
        if len(raw) != 64 or any(c not in "0123456789abcdefABCDEF" for c in raw):
            return None
        return raw.lower()
