import json

import pytest

from app.core.settings import get_settings
from app.services.twak.config import TrustWalletConfigService


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def bridge_config_for(base_url: str | None):
    payload = {"baseUrl": base_url} if base_url is not None else {}
    return json.dumps(payload)


def test_public_host_only_bridge_url_defaults_to_https(monkeypatch) -> None:
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv(
        "TRUST_WALLET_AGENT_KIT_CONFIG",
        bridge_config_for("omniagent-twak-production.up.railway.app/"),
    )

    config = TrustWalletConfigService.get_trust_wallet_bridge_config()

    assert config.base_url == "https://omniagent-twak-production.up.railway.app"


def test_private_railway_bridge_url_defaults_to_http(monkeypatch) -> None:
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv(
        "TRUST_WALLET_AGENT_KIT_CONFIG",
        bridge_config_for("twak-bridge.railway.internal:8787/"),
    )

    config = TrustWalletConfigService.get_trust_wallet_bridge_config()

    assert config.base_url == "http://twak-bridge.railway.internal:8787"


def test_local_ipv6_bridge_url_defaults_to_http(monkeypatch) -> None:
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", bridge_config_for("[::1]:8787/"))

    config = TrustWalletConfigService.get_trust_wallet_bridge_config()

    assert config.base_url == "http://[::1]:8787"


def test_similar_public_hosts_are_not_treated_as_internal(monkeypatch) -> None:
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv(
        "TRUST_WALLET_AGENT_KIT_CONFIG",
        bridge_config_for("localhost.example.com:8787/"),
    )

    config = TrustWalletConfigService.get_trust_wallet_bridge_config()

    assert config.base_url == "https://localhost.example.com:8787"


def test_generic_internal_service_url_defaults_to_http(monkeypatch) -> None:
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", bridge_config_for("service.internal:8787/"))

    config = TrustWalletConfigService.get_trust_wallet_bridge_config()

    assert config.base_url == "http://service.internal:8787"


def test_explicit_bridge_url_scheme_is_preserved(monkeypatch) -> None:
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv(
        "TRUST_WALLET_AGENT_KIT_CONFIG",
        bridge_config_for("https://twak.example.com/"),
    )

    config = TrustWalletConfigService.get_trust_wallet_bridge_config()

    assert config.base_url == "https://twak.example.com"


def test_blank_bridge_url_remains_unconfigured(monkeypatch) -> None:
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    monkeypatch.setenv("TRUST_WALLET_AGENT_KIT_CONFIG", bridge_config_for("  "))

    config = TrustWalletConfigService.get_trust_wallet_bridge_config()

    assert config.base_url is None
