from datetime import datetime, timezone
import hashlib
import json


class CmcResponseCache:
    def __init__(self) -> None:
        self._rows: dict[tuple[str, ...], tuple[datetime, dict[str, object]]] = {}

    def get(self, key: tuple[str, ...], ttl_sec: int) -> dict[str, object] | None:
        if ttl_sec <= 0:
            return None
        cached = self._rows.get(key)
        if not cached:
            return None
        cached_at, payload = cached
        if (datetime.now(timezone.utc) - cached_at).total_seconds() > ttl_sec:
            self._rows.pop(key, None)
            return None
        return {**payload, "cached": True}

    def set(self, key: tuple[str, ...], payload: dict[str, object]) -> None:
        self._rows[key] = (datetime.now(timezone.utc), payload)

    def clear(self) -> None:
        self._rows.clear()

    @staticmethod
    def key(endpoint: str, api_key: str, *parts: object) -> tuple[str, ...]:
        digest = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:16]
        return (endpoint, digest, *(CmcResponseCache.stable_part(part) for part in parts))

    @staticmethod
    def stable_part(value: object) -> str:
        if isinstance(value, (dict, list, tuple)):
            return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
        return str(value)
