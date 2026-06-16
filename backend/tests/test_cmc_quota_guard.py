import asyncio

import httpx

from app.core.settings import get_settings
from app.services.cmc.agent_hub import CmcAgentHubClient
from app.services.cmc.agent_hub_tools import CmcAgentHubToolClient
from app.services.cmc.prices import CmcPriceService
from app.services.cmc.quota_guard import CmcQuotaGuard


def test_cmc_price_snapshot_pauses_after_rate_limit(monkeypatch) -> None:
    from app.services.cmc import prices as cmc

    calls: list[str] = []

    class FakeClient:
        def __init__(self, timeout: int) -> None:
            self.timeout = timeout

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
            return None

        async def get(self, url: str, params: dict[str, object], headers: dict[str, str]) -> dict[str, object]:
            calls.append(url)
            request = httpx.Request("GET", url)
            response = httpx.Response(429, request=request)
            raise httpx.HTTPStatusError("too many requests", request=request, response=response)

    monkeypatch.setenv("CMC_AGENT_HUB_API_KEY", "cmc-test-key")
    monkeypatch.setenv("CMC_QUOTA_COOLDOWN_SEC", "60")
    get_settings.cache_clear()
    cmc._PRICE_CACHE.clear()
    monkeypatch.setattr(cmc.httpx, "AsyncClient", FakeClient)

    first = asyncio.run(CmcPriceService.get_price_snapshot(["BNB"]))
    second = asyncio.run(CmcPriceService.get_price_snapshot(["BNB"]))

    assert calls == ["https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest"]
    assert first["quotaLimited"] is True
    assert second["quotaLimited"] is True
    assert "quota/rate limit" in str(first["reason"])
    assert second["reachable"] is False
    get_settings.cache_clear()


def test_cmc_agent_hub_1010_sets_shared_quota_guard(monkeypatch) -> None:
    calls: list[str] = []

    async def fake_request(
        endpoint: str,
        api_key: str,
        method: str,
        params: dict[str, object],
        session_id: str | None = None,
        timeout_sec: int = 15,
    ) -> dict[str, object]:
        calls.append(method)
        if method == "initialize":
            return {"sessionId": "session-1"}
        return {
            "content": [{
                "type": "text",
                "text": '{"error":{"code":1010,"message":"Monthly credit limit reached."}}',
            }]
        }

    async def fake_notification(*args: object, **kwargs: object) -> None:
        return None

    monkeypatch.setenv("CMC_MCP_API_KEY", "cmc-test-key")
    monkeypatch.setenv("CMC_QUOTA_COOLDOWN_SEC", "60")
    get_settings.cache_clear()
    monkeypatch.setattr(CmcAgentHubClient, "mcp_request", fake_request)
    monkeypatch.setattr(CmcAgentHubClient, "mcp_notification", fake_notification)

    result = asyncio.run(CmcAgentHubToolClient.call_cmc_agent_hub_tool({
        "toolName": "trending_crypto_narratives",
        "arguments": {"symbol": "BNB"},
    }))

    assert result["ready"] is False
    assert result["quotaLimited"] is True
    assert "1010" in str(result["reason"])
    assert CmcQuotaGuard.active() is not None
    assert calls == ["initialize", "tools/call"]
    get_settings.cache_clear()


def test_cmc_agent_hub_status_short_circuits_during_quota_cooldown(monkeypatch) -> None:
    async def fail_request(*args: object, **kwargs: object) -> dict[str, object]:
        raise AssertionError("CMC network should not be called during quota cooldown")

    monkeypatch.setenv("CMC_MCP_API_KEY", "cmc-test-key")
    get_settings.cache_clear()
    CmcQuotaGuard.remember("CMC Agent Hub error 1010: Monthly credit limit reached.", 60)
    monkeypatch.setattr(CmcAgentHubClient, "mcp_request", fail_request)

    result = asyncio.run(CmcAgentHubClient.get_cmc_agent_hub_status())

    assert result["ready"] is False
    assert result["quotaLimited"] is True
    assert "Monthly credit limit reached" in str(result["reason"])
    get_settings.cache_clear()
