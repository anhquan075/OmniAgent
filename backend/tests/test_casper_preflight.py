from pathlib import Path

from app.core.settings import get_settings
from app.services.casper import preflight as preflight_module
from app.services.casper.preflight import CasperPreflightService
from app.services.casper.submitter import CasperCliSubmitter


def test_secret_path_outside_repo_uses_backend_root_when_repo_root_is_filesystem_root(
    tmp_path,
    monkeypatch,
) -> None:
    app_root = tmp_path / "app"
    app_root.mkdir()
    volume_root = tmp_path / "data"
    volume_root.mkdir()

    monkeypatch.setattr(preflight_module, "REPO_ROOT", Path("/"))
    monkeypatch.setattr(preflight_module, "BACKEND_ROOT", app_root)

    assert CasperPreflightService.is_outside_repo(volume_root / "casper" / "secret_key.pem") is True
    assert CasperPreflightService.is_outside_repo(app_root / "secret_key.pem") is False


def test_live_preflight_blocks_when_balance_is_below_payment(tmp_path, monkeypatch) -> None:
    secret_path = tmp_path / "secret.pem"
    secret_path.write_text("not-a-real-secret", encoding="utf-8")
    monkeypatch.setenv("CASPER_ACCOUNT_PUBLIC_KEY", "01" + "a" * 64)
    monkeypatch.setenv("CASPER_SECRET_KEY_PATH", str(secret_path))
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "a" * 64)
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_PACKAGE_HASH", "b" * 64)
    monkeypatch.setenv("CASPER_LIVE_SUBMIT_ENABLED", "true")
    monkeypatch.setenv("CASPER_PAYMENT_AMOUNT_MOTES", "25000000000")
    get_settings.cache_clear()
    monkeypatch.setattr(CasperCliSubmitter, "is_client_available", staticmethod(lambda: True))
    monkeypatch.setattr(
        CasperCliSubmitter,
        "get_state_root_hash",
        staticmethod(lambda: {"hardBlockers": [], "stateRootHash": "c" * 64}),
    )
    monkeypatch.setattr(
        CasperCliSubmitter,
        "query_account_balance",
        staticmethod(lambda public_key: {
            "status": "ready",
            "source": "casper_client_query_balance",
            "motes": 0,
            "cspr": 0.0,
            "hardBlockers": [],
        }),
    )

    result = CasperPreflightService.get_live_preflight({})

    assert "casper_account_balance_insufficient" in result["hardBlockers"]
    assert result["liveSubmitEnabled"] is False
    assert result["accountBalance"]["motes"] == 0

    get_settings.cache_clear()


def test_live_preflight_preserves_configured_balance_reserve(tmp_path, monkeypatch) -> None:
    secret_path = tmp_path / "secret.pem"
    secret_path.write_text("not-a-real-secret", encoding="utf-8")
    monkeypatch.setenv("CASPER_ACCOUNT_PUBLIC_KEY", "01" + "a" * 64)
    monkeypatch.setenv("CASPER_SECRET_KEY_PATH", str(secret_path))
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "a" * 64)
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_PACKAGE_HASH", "b" * 64)
    monkeypatch.setenv("CASPER_LIVE_SUBMIT_ENABLED", "true")
    monkeypatch.setenv("CASPER_PAYMENT_AMOUNT_MOTES", "2500000000")
    monkeypatch.setenv("CASPER_MIN_BALANCE_CSPR", "50")
    monkeypatch.setenv("API_OPERATOR_TOKEN", "operator-secret")
    monkeypatch.setenv("API_SESSION_SECRET", "a-secure-production-session-secret")
    get_settings.cache_clear()
    monkeypatch.setattr(CasperCliSubmitter, "is_client_available", staticmethod(lambda: True))
    monkeypatch.setattr(
        CasperCliSubmitter,
        "get_state_root_hash",
        staticmethod(lambda: {"hardBlockers": [], "stateRootHash": "c" * 64}),
    )
    monkeypatch.setattr(
        CasperCliSubmitter,
        "query_account_balance",
        staticmethod(lambda public_key: {
            "status": "ready",
            "motes": 51_000_000_000,
            "cspr": 51.0,
            "hardBlockers": [],
        }),
    )

    result = CasperPreflightService.get_live_preflight({})

    assert "casper_account_balance_reserve_reached" in result["hardBlockers"]
    assert result["liveSubmitEnabled"] is False

    get_settings.cache_clear()


def test_live_preflight_fails_closed_when_balance_is_unavailable(tmp_path, monkeypatch) -> None:
    secret_path = tmp_path / "secret.pem"
    secret_path.write_text("not-a-real-secret", encoding="utf-8")
    monkeypatch.setenv("CASPER_ACCOUNT_PUBLIC_KEY", "01" + "a" * 64)
    monkeypatch.setenv("CASPER_SECRET_KEY_PATH", str(secret_path))
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_HASH", "a" * 64)
    monkeypatch.setenv("CASPER_DECISION_CONTRACT_PACKAGE_HASH", "b" * 64)
    monkeypatch.setenv("CASPER_LIVE_SUBMIT_ENABLED", "true")
    get_settings.cache_clear()
    monkeypatch.setattr(CasperCliSubmitter, "is_client_available", staticmethod(lambda: True))
    monkeypatch.setattr(
        CasperCliSubmitter,
        "get_state_root_hash",
        staticmethod(lambda: {"hardBlockers": [], "stateRootHash": "c" * 64}),
    )
    monkeypatch.setattr(
        CasperCliSubmitter,
        "query_account_balance",
        staticmethod(lambda public_key: None),
    )

    result = CasperPreflightService.get_live_preflight({})

    assert "casper_account_balance_unavailable" in result["hardBlockers"]
    assert result["liveSubmitEnabled"] is False

    get_settings.cache_clear()
