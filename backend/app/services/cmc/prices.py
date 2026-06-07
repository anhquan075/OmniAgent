from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core.settings import get_settings

CMC_KEY_REASON = (
    "CMC_AGENT_HUB_API_KEY, CMC_MCP_API_KEY, CMC_PRO_API_KEY, "
    "COINMARKETCAP_API_KEY, or X_CMC_PRO_API_KEY is not configured"
)
PRICE_CACHE_TTL = timedelta(seconds=45)
_PRICE_CACHE: dict[tuple[str, ...], tuple[datetime, dict[str, object]]] = {}

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

        cache_key = tuple(selected)
        cached = CmcPriceService.cached_snapshot(cache_key)
        if cached:
            return cached

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
            return {
                "source": "coinmarketcap",
                "configured": True,
                "reachable": False,
                "symbols": {symbol: {"symbol": symbol, "priceUsd": None} for symbol in selected},
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "reason": str(error),
            }

        data = payload.get("data") or {}
        prices: dict[str, object] = {}
        for symbol in selected:
            raw = data.get(symbol)
            item = raw[0] if isinstance(raw, list) and raw else raw
            quote = ((item or {}).get("quote") or {}).get("USD") or {}
            prices[symbol] = {
                "symbol": symbol,
                "priceUsd": quote.get("price"),
                "percentChange24h": quote.get("percent_change_24h"),
            }
        snapshot = {
            "source": "coinmarketcap",
            "configured": True,
            "reachable": True,
            "symbols": prices,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        _PRICE_CACHE[cache_key] = (datetime.now(timezone.utc), snapshot)
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
        cached = _PRICE_CACHE.get(cache_key)
        if not cached:
            return None
        cached_at, payload = cached
        if datetime.now(timezone.utc) - cached_at > PRICE_CACHE_TTL:
            _PRICE_CACHE.pop(cache_key, None)
            return None
        return {**payload, "cached": True}
