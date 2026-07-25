"""Tests for x402 buy → verify → act public lab."""

from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError

from fastapi.testclient import TestClient

from app.core.settings import get_settings
from app.main import create_app
from app.services.casper.paid_act import CasperPaidActService


def _receipt_json(**overrides: Any) -> str:
    base = {
        "receiptId": "93074ccb7f55f7a6eac5f4acdf5de21943c43384a1bfb0f1e194c736eed3bae5",
        "provider": "x402",
        "resourceUrl": "https://omniagent-production.up.railway.app/api/x402/rwa-evidence",
        "paidAt": "2026-07-23T12:00:00+00:00",
        "amount": "1000000",
        "currency": "WCSPR",
        "network": "casper:casper-test",
        "seller": "005fbafb3d180056637745218c3a21bef20ad4aca0737b676125791db7a2ead0c6",
        "buyer": "01aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
        "settlementTxHash": "93074ccb7f55f7a6eac5f4acdf5de21943c43384a1bfb0f1e194c736eed3bae5",
        "sourceHash": "sha256:" + "b" * 64,
    }
    base.update(overrides)
    return json.dumps(base)


def _configure_x402(monkeypatch, *, with_receipt: bool = True) -> None:
    monkeypatch.setenv(
        "CASPER_X402_EVIDENCE_URL",
        "https://omniagent-production.up.railway.app/api/x402/rwa-evidence",
    )
    monkeypatch.setenv(
        "CASPER_X402_PAY_TO_ADDRESS",
        "005fbafb3d180056637745218c3a21bef20ad4aca0737b676125791db7a2ead0c6",
    )
    monkeypatch.setenv("CASPER_X402_FACILITATOR_API_KEY", "test-key")
    monkeypatch.setenv("CASPER_VAULT_ENFORCE_ENABLED", "true")
    if with_receipt:
        monkeypatch.setenv("CASPER_X402_RECEIPT", _receipt_json())
    else:
        monkeypatch.delenv("CASPER_X402_RECEIPT", raising=False)
    get_settings.cache_clear()


class _FakeHTTPError(HTTPError):
    def __init__(self, code: int, body: dict[str, Any]) -> None:
        self._body = json.dumps(body).encode("utf-8")
        super().__init__(
            url="https://example.invalid/api/x402/rwa-evidence",
            code=code,
            msg="Payment Required",
            hdrs=None,  # type: ignore[arg-type]
            fp=None,
        )

    def read(self) -> bytes:
        return self._body


def test_paid_act_catalog_ready_when_receipt_bound(monkeypatch) -> None:
    _configure_x402(monkeypatch, with_receipt=True)
    catalog = CasperPaidActService.public_paid_act()
    assert catalog["count"] == 3
    assert catalog["readyCount"] == 3
    assert catalog["status"] == "ready"
    assert catalog["x402Status"] == "verified"
    assert catalog["steps"][0]["id"] == "probe_unpaid"


def test_paid_act_probe_unpaid_returns_402(monkeypatch) -> None:
    _configure_x402(monkeypatch, with_receipt=True)

    def _raise_402(*_args: Any, **_kwargs: Any) -> Any:
        raise _FakeHTTPError(
            402,
            {
                "x402Version": 2,
                "error": "X-PAYMENT header is required",
                "network": "casper",
                "accepts": [
                    {
                        "scheme": "exact",
                        "network": "casper:casper-test",
                        "amount": "1000000",
                        "asset": "3d80df21ba4ee4d66a2a1f60c32570dd5685e4b279f6538162a5fd1314847c1e",
                    }
                ],
            },
        )

    monkeypatch.setattr("app.services.casper.paid_act.urlopen", _raise_402)
    result = CasperPaidActService.run_step("probe_unpaid")
    assert result["ok"] is True
    assert result["status"] == "payment_required"
    assert result["httpStatus"] == 402
    assert result["paymentNetwork"] == "casper:casper-test"


def test_paid_act_verify_and_enforce(monkeypatch) -> None:
    _configure_x402(monkeypatch, with_receipt=True)
    verify = CasperPaidActService.run_step("verify_settle")
    assert verify["ok"] is True
    assert verify["status"] == "verified"
    assert verify["settlementTxHash"]
    assert "testnet.cspr.live/deploy/" in str(verify["explorerUrl"])

    enforce = CasperPaidActService.run_step("enforce_from_paid")
    assert enforce["ok"] is True
    assert enforce["status"] == "unlocked"
    assert enforce["unlocked"] is True
    assert enforce["vaultEnforceEnabled"] is True
    assert "unpaid" in enforce["contrast"]


def test_paid_act_enforce_blocked_without_receipt(monkeypatch) -> None:
    _configure_x402(monkeypatch, with_receipt=False)
    enforce = CasperPaidActService.run_step("enforce_from_paid")
    assert enforce["ok"] is False
    assert enforce["status"] == "blocked"
    assert enforce["unlocked"] is False
    assert "enforce_locked_until_paid" in enforce["hardBlockers"]


def test_paid_act_http_routes(monkeypatch) -> None:
    _configure_x402(monkeypatch, with_receipt=True)

    def _raise_402(*_args: Any, **_kwargs: Any) -> Any:
        raise _FakeHTTPError(
            402,
            {
                "accepts": [{"network": "casper:casper-test", "amount": "1000000"}],
                "error": "X-PAYMENT header is required",
            },
        )

    monkeypatch.setattr("app.services.casper.paid_act.urlopen", _raise_402)
    client = TestClient(create_app())
    catalog = client.get("/api/public/paid-act")
    assert catalog.status_code == 200
    assert catalog.json()["count"] == 3

    probe = client.post("/api/public/paid-act/probe_unpaid")
    assert probe.status_code == 200
    assert probe.json()["httpStatus"] == 402

    proof = client.get("/api/public/proof")
    assert proof.status_code == 200
    assert proof.json()["paidAct"]["count"] == 3

    missing = client.post("/api/public/paid-act/not-a-step")
    assert missing.status_code == 404
