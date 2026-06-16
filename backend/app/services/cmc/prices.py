from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.settings import get_settings
from app.services.cmc.quota_guard import CmcQuotaGuard
from app.services.cmc.response_cache import CmcResponseCache

CMC_KEY_REASON = (
    "CMC_AGENT_HUB_API_KEY, CMC_MCP_API_KEY, CMC_PRO_API_KEY, "
    "COINMARKETCAP_API_KEY, or X_CMC_PRO_API_KEY is not configured"
)
_PRICE_CACHE = CmcResponseCache()

class CmcPriceService:
    @staticmethod
    async def get_price_snapshot(symbols: list[str] | None = None) -> dict[str, object]:
        settings = get_settings()
        selected = CmcPriceService.normalize_symbols(symbols)
        api_key = settings.cmc_api_key
        if not api_key:
            return {
                "source": "coinmarketcap",
                "configured": False,
                "symbols": {symbol: {"symbol": symbol, "priceUsd": None} for symbol in selected},
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "reason": CMC_KEY_REASON,
            }

        cache_key = CmcResponseCache.key(settings.cmc_agent_hub_base_url, api_key, *selected)
        cached = CmcPriceService.cached_snapshot(cache_key)
        if cached:
            return cached
        quota_block = CmcQuotaGuard.active()
        if quota_block:
            return CmcPriceService.unreachable_snapshot(selected, quota_block)

        url = f"{settings.cmc_agent_hub_base_url.rstrip('/')}/v2/cryptocurrency/quotes/latest"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    url,
                    params={"symbol": ",".join(selected), "convert": "USD"},
                    headers={"X-CMC_PRO_API_KEY": api_key},
                )
                response.raise_for_status()
                payload: dict[str, Any] = response.json()
        except httpx.HTTPError as error:
            reason = CmcQuotaGuard.reason_from_exception(error)
            if reason:
                quota_block = CmcQuotaGuard.remember(reason, settings.cmc_quota_cooldown_sec)
                return CmcPriceService.unreachable_snapshot(selected, quota_block)
            return CmcPriceService.unreachable_snapshot(selected, {"reason": str(error)})

        data = payload.get("data") or {}
        prices: dict[str, object] = {}
        for symbol in selected:
            raw = data.get(symbol)
            item = raw[0] if isinstance(raw, list) and raw else raw
            quote = ((item or {}).get("quote") or {}).get("USD") or {}
            row = {
                "symbol": symbol,
                "priceUsd": quote.get("price"),
                "percentChange24h": quote.get("percent_change_24h"),
            }
            optional_fields = {
                "percentChange1h": quote.get("percent_change_1h"),
                "percentChange7d": quote.get("percent_change_7d"),
                "volume24h": quote.get("volume_24h"),
                "marketCap": quote.get("market_cap"),
                "lastUpdated": quote.get("last_updated"),
            }
            prices[symbol] = {**row, **{key: value for key, value in optional_fields.items() if value is not None}}
        snapshot = {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": prices,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        _PRICE_CACHE.set(cache_key, snapshot)
        return snapshot

    @staticmethod
    def normalize_symbols(symbols: list[str] | None) -> list[str]:
        seen: set[str] = set()
        selected: list[str] = []
        for raw_symbol in symbols or ["BNB", "CAKE", "TWT"]:
            symbol = str(raw_symbol).strip().upper()
            if symbol and symbol not in seen:
                seen.add(symbol)
                selected.append(symbol)
        return selected or ["BNB", "CAKE", "TWT"]

    @staticmethod
    def cached_snapshot(cache_key: tuple[str, ...]) -> dict[str, object] | None:
        return _PRICE_CACHE.get(cache_key, get_settings().cmc_price_cache_ttl_sec)

    @staticmethod
    def unreachable_snapshot(symbols: list[str], fields: dict[str, object]) -> dict[str, object]:
        return {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": False,
            "symbols": {symbol: {"symbol": symbol, "priceUsd": None} for symbol in symbols},
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **fields,
        }
