from app.services.casper.rwa_evidence import (
    CasperRwaEvidenceService,
    default_evidence_fixture,
    fetch_treasury_yield,
    TREASURY_API_URL,
)


def test_default_fixture_still_works() -> None:
    fixture = default_evidence_fixture()
    assert len(fixture) == 1
    assert fixture[0]["id"] == "us-treasury-10y-yield"
    assert fixture[0]["observedValue"] == 4.52


def test_treasury_api_url_is_correct() -> None:
    assert "fiscaldata.treasury.gov" in TREASURY_API_URL
    assert "avg_interest_rates" in TREASURY_API_URL


async def test_fetch_treasury_yield_falls_back_on_error(monkeypatch) -> None:
    async def fake_get(*args, **kwargs):
        raise ConnectionError("network error")

    class FakeClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def get(self, *a, **kw):
            raise ConnectionError("network error")

    monkeypatch.setattr("app.services.casper.rwa_evidence.httpx.AsyncClient", FakeClient)
    result = await fetch_treasury_yield()
    assert len(result) == 1
    assert result[0]["source"] == "static_fallback"
    assert result[0]["observedValue"] == 4.52


async def test_fetch_treasury_yield_falls_back_on_empty_response(monkeypatch) -> None:
    class FakeResponse:
        def raise_for_status(self): pass
        def json(self): return {"data": []}

    class FakeClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def get(self, *a, **kw): return FakeResponse()

    monkeypatch.setattr("app.services.casper.rwa_evidence.httpx.AsyncClient", FakeClient)
    result = await fetch_treasury_yield()
    assert result[0]["source"] == "static_fallback"


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


async def test_fetch_treasury_yield_falls_back_on_timeout(monkeypatch) -> None:
    import httpx

    class FakeClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): pass
        async def get(self, *a, **kw):
            raise httpx.TimeoutException("timeout")

    monkeypatch.setattr("app.services.casper.rwa_evidence.httpx.AsyncClient", FakeClient)
    result = await fetch_treasury_yield()
    assert result[0]["source"] == "static_fallback"


def test_evidence_bundle_with_live_source_tag() -> None:
    fixture = default_evidence_fixture()
    fixture[0]["source"] = "live_treasury_api"
    bundle = CasperRwaEvidenceService.build_evidence_bundle({"evidence": fixture})
    assert bundle["status"] == "ready"