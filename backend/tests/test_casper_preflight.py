from pathlib import Path

from app.services.casper import preflight as preflight_module
from app.services.casper.preflight import CasperPreflightService


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
