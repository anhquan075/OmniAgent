import pytest

from app.services.casper.rwa_evidence import CasperRwaEvidenceService, fetch_treasury_yield, TREASURY_API_URL
from tests.casper_evidence_fixtures import sample_treasury_evidence


def test_sample_treasury_evidence_still_works() -> None:
    fixture = sample_treasury_evidence()
    assert len(fixture) == 1
    assert fixture[0]["id"] == "us-treasury-10y-yield"
    assert fixture[0]["observedValue"] == 4.52


def test_treasury_api_url_is_correct() -> None:
    assert "fiscaldata.treasury.gov" in TREASURY_API_URL
    assert "avg_interest_rates" in TREASURY_API_URL


async def test_fetch_treasury_yield_fails_closed_on_error(monkeypatch) -> None:
    class FakeClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def get(self, *a, **kw):
            raise ConnectionError("network error")

    monkeypatch.setattr("app.services.casper.rwa_evidence.httpx.AsyncClient", FakeClient)
    with pytest.raises(RuntimeError, match="treasury_yield_unavailable"):
        await fetch_treasury_yield()


async def test_fetch_treasury_yield_fails_closed_on_empty_response(monkeypatch) -> None:
    class FakeResponse:
        def raise_for_status(self): pass
        def json(self): return {"data": []}

    class FakeClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def get(self, *a, **kw): return FakeResponse()

    monkeypatch.setattr("app.services.casper.rwa_evidence.httpx.AsyncClient", FakeClient)
    with pytest.raises(RuntimeError, match="10-year yield not found"):
        await fetch_treasury_yield()


async def test_fetch_treasury_yield_parses_live_data(monkeypatch) -> None:
    class FakeResponse:
        def raise_for_status(self): pass
        def json(self):
            return {"data": [{"security_desc": "Treasury Constant Maturity|10-Year", "avg_interest_rate": "4.25"}]}

    class FakeClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def get(self, *a, **kw): return FakeResponse()

    monkeypatch.setattr("app.services.casper.rwa_evidence.httpx.AsyncClient", FakeClient)
    result = await fetch_treasury_yield()
    assert result[0]["source"] == "live_treasury_api"
    assert result[0]["observedValue"] == 4.25


async def test_fetch_treasury_yield_retries_transient_transport_error(monkeypatch) -> None:
    import httpx

    class FakeResponse:
        def raise_for_status(self): pass
        def json(self):
            return {"data": [{
                "record_date": "2026-05-31",
                "security_desc": "Treasury Notes",
                "avg_interest_rate_amt": "3.248",
            }]}

    class FakeClient:
        attempts = 0

        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def get(self, *a, **kw):
            FakeClient.attempts += 1
            if FakeClient.attempts == 1:
                raise httpx.RemoteProtocolError("Server disconnected without sending a response.")
            return FakeResponse()

    async def no_sleep(*a, **kw): pass

    monkeypatch.setattr("app.services.casper.rwa_evidence.httpx.AsyncClient", FakeClient)
    monkeypatch.setattr("app.services.casper.rwa_evidence.asyncio.sleep", no_sleep)

    result = await fetch_treasury_yield()

    assert FakeClient.attempts == 2
    assert result[0]["observedValue"] == 3.248


async def test_fetch_treasury_yield_fails_closed_on_timeout(monkeypatch) -> None:
    import httpx

    class FakeClient:
        attempts = 0

        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def get(self, *a, **kw):
            FakeClient.attempts += 1
            raise httpx.TimeoutException("timeout")

    async def no_sleep(*a, **kw): pass

    monkeypatch.setattr("app.services.casper.rwa_evidence.httpx.AsyncClient", FakeClient)
    monkeypatch.setattr("app.services.casper.rwa_evidence.asyncio.sleep", no_sleep)
    with pytest.raises(RuntimeError, match="treasury_yield_unavailable"):
        await fetch_treasury_yield()
    assert FakeClient.attempts == 3


def test_evidence_bundle_with_live_source_tag() -> None:
    fixture = sample_treasury_evidence()
    fixture[0]["source"] = "live_treasury_api"
    bundle = CasperRwaEvidenceService.build_evidence_bundle({"evidence": fixture})
    assert bundle["status"] == "ready"
