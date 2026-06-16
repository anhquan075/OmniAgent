from datetime import datetime, timedelta, timezone

import httpx


LIMIT_TERMS = ("1010", "429", "credit limit", "rate limit", "too many requests")
_QUOTA_BLOCK: tuple[datetime, str] | None = None


class CmcQuotaGuard:
    @staticmethod
    def active() -> dict[str, object] | None:
        global _QUOTA_BLOCK
        if _QUOTA_BLOCK is None:
            return None
        blocked_until, reason = _QUOTA_BLOCK
        now = datetime.now(timezone.utc)
        if blocked_until <= now:
            _QUOTA_BLOCK = None
            return None
        retry_after = max(1, int((blocked_until - now).total_seconds()))
        return {
            "quotaLimited": True,
            "retryAfterSec": retry_after,
            "quotaBlockedUntil": blocked_until.isoformat(),
            "reason": reason,
        }

    @staticmethod
    def remember(reason: str, cooldown_sec: int) -> dict[str, object]:
        global _QUOTA_BLOCK
        blocked_until = datetime.now(timezone.utc) + timedelta(seconds=max(1, cooldown_sec))
        _QUOTA_BLOCK = (blocked_until, reason)
        return CmcQuotaGuard.active() or {}

    @staticmethod
    def reason_from_exception(error: Exception) -> str | None:
        if isinstance(error, httpx.HTTPStatusError) and error.response.status_code == 429:
            return "CoinMarketCap quota/rate limit reached; CMC calls are temporarily paused."
        message = str(error).strip()
        return message if CmcQuotaGuard.is_quota_reason(message) else None

    @staticmethod
    def is_quota_reason(value: object) -> bool:
        lowered = str(value or "").lower()
        return any(term in lowered for term in LIMIT_TERMS)

    @staticmethod
    def clear() -> None:
        global _QUOTA_BLOCK
        _QUOTA_BLOCK = None
