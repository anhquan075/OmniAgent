from app.core.settings import get_settings
from app.services.casper.cspr_cloud import CsprCloudClient
from app.services.casper.preflight import CasperPreflightService
from app.services.casper.submitter import CasperCliSubmitter


class FakeResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, object]:
        return self.payload


def test_get_block_height_returns_height_from_api(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    class FakeClient:
        def __init__(self, **_: object) -> None:
            return None

        def __enter__(self) -> "FakeClient":
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def get(self, url: str, params: dict[str, object]) -> FakeResponse:
            calls.append({"url": url, "params": params})
            return FakeResponse({"data": [{"height": 12345}]})

    monkeypatch.setenv("CASPER_CSPR_CLOUD_API_KEY", "test-key")
    monkeypatch.setenv("CASPER_CSPR_CLOUD_URL", "https://cspr.example")
    monkeypatch.setattr("app.services.casper.cspr_cloud.httpx.Client", FakeClient)
    get_settings.cache_clear()

    assert CsprCloudClient.get_block_height() == 12345
    assert calls == [{"url": "https://cspr.example/api/v1/blocks", "params": {"limit": 1}}]


def test_get_block_height_returns_none_on_error(monkeypatch) -> None:
    class FailingClient:
        def __init__(self, **_: object) -> None:
            return None

        def __enter__(self) -> "FailingClient":
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def get(self, *_: object, **__: object) -> FakeResponse:
            raise RuntimeError("network down")

    monkeypatch.setenv("CASPER_CSPR_CLOUD_API_KEY", "test-key")
    monkeypatch.setattr("app.services.casper.cspr_cloud.httpx.Client", FailingClient)
    get_settings.cache_clear()

    assert CsprCloudClient.get_block_height() is None


def test_get_account_balance_returns_motes_and_cspr(monkeypatch) -> None:
    class FakeClient:
        def __init__(self, **_: object) -> None:
            return None

        def __enter__(self) -> "FakeClient":
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def get(self, url: str) -> FakeResponse:
            assert url == "https://api.testnet.cspr.cloud/api/v1/accounts/abc/balance"
            return FakeResponse({"data": {"balance": "2500000000"}})

    monkeypatch.setenv("CASPER_CSPR_CLOUD_API_KEY", "test-key")
    monkeypatch.setattr("app.services.casper.cspr_cloud.httpx.Client", FakeClient)
    get_settings.cache_clear()

    assert CsprCloudClient.get_account_balance("abc") == {
        "motes": 2_500_000_000,
        "cspr": 2.5,
    }


def test_cspr_cloud_is_skipped_without_api_key(monkeypatch) -> None:
    class FailingClient:
        def __init__(self, **_: object) -> None:
            raise AssertionError("http client should not be constructed")

    monkeypatch.delenv("CASPER_CSPR_CLOUD_API_KEY", raising=False)
    monkeypatch.setattr("app.services.casper.cspr_cloud.httpx.Client", FailingClient)
    get_settings.cache_clear()

    assert CsprCloudClient.get_block_height() is None
    assert CsprCloudClient.get_account_balance("abc") is None


def test_preflight_uses_cspr_cloud_probe_and_balance_warning(monkeypatch) -> None:
    monkeypatch.setenv("CASPER_ACCOUNT_PUBLIC_KEY", "abc")
    monkeypatch.setenv("CASPER_CSPR_CLOUD_API_KEY", "test-key")
    monkeypatch.setenv("CASPER_MIN_BALANCE_CSPR", "50")
    get_settings.cache_clear()
    monkeypatch.setattr(CasperCliSubmitter, "is_client_available", staticmethod(lambda: False))
    monkeypatch.setattr(CsprCloudClient, "get_block_height", staticmethod(lambda: 777))
    monkeypatch.setattr(
        CsprCloudClient,
        "get_account_balance",
        staticmethod(lambda public_key: {"motes": 1_000_000_000, "cspr": 1.0}),
    )

    result = CasperPreflightService.get_live_preflight({})

    assert result["rpcProbe"]["source"] == "cspr_cloud"
    assert result["rpcProbe"]["blockHeight"] == 777
    assert result["accountBalance"] == {"motes": 1_000_000_000, "cspr": 1.0, "source": "cspr_cloud"}
    assert "casper_account_balance_low" in result["warnings"]
