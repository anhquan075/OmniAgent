"""Unit tests for Casper x402 facilitator client (no network)."""

from __future__ import annotations

import base64
import json
from typing import Any

import pytest

from app.services.casper.casper_x402_facilitator import (
    CasperX402Config,
    CasperX402Facilitator,
    build_payment_requirements,
    decode_payment_payload,
    gate_payment,
    normalize_cep18_asset,
    payment_required_body,
)


def _cfg(**overrides: Any) -> CasperX402Config:
    base = {
        "facilitator_url": "https://x402-facilitator.cspr.cloud",
        "network": "casper:casper-test",
        "pay_to": "00" + "ab" * 32,
        "asset": "3d80df21ba4ee4d66a2a1f60c32570dd5685e4b279f6538162a5fd1314847c1e",
        "amount": "1000000",
        "description": "test",
        "api_key": "test-key",
        "extra": {"name": "Wrapped CSPR", "version": "1", "decimals": "9"},
    }
    base.update(overrides)
    return CasperX402Config(**base)


def test_normalize_cep18_asset_strips_hash_prefix() -> None:
    bare = "3d80df21ba4ee4d66a2a1f60c32570dd5685e4b279f6538162a5fd1314847c1e"
    assert normalize_cep18_asset(f"hash-{bare}") == bare
    assert normalize_cep18_asset(f"0x{bare}") == bare
    assert normalize_cep18_asset(bare.upper()) == bare


def test_build_payment_requirements_uses_amount_not_max() -> None:
    req = build_payment_requirements(_cfg(), "https://example.com/api/x402/rwa-evidence")
    assert req["scheme"] == "exact"
    assert req["network"] == "casper:casper-test"
    assert req["amount"] == "1000000"
    assert "maxAmountRequired" not in req
    assert req["extra"]["version"] == "1"
    assert req["payTo"].startswith("00")
    assert not req["asset"].startswith("hash-")
    assert len(req["asset"]) == 64


def test_build_payment_requirements_strips_hash_prefix_from_cfg() -> None:
    bare = "3d80df21ba4ee4d66a2a1f60c32570dd5685e4b279f6538162a5fd1314847c1e"
    req = build_payment_requirements(
        _cfg(asset=f"hash-{bare}"),
        "https://example.com/r",
    )
    assert req["asset"] == bare


def test_payment_required_body_shape() -> None:
    body = payment_required_body(_cfg(), "https://example.com/r", error="need pay")
    assert body["x402Version"] == 2
    assert len(body["accepts"]) == 1
    assert body["error"] == "need pay"


def test_decode_payment_payload_base64_and_raw() -> None:
    payload = {"x402Version": 2, "scheme": "exact"}
    raw = json.dumps(payload)
    encoded = base64.b64encode(raw.encode()).decode()
    assert decode_payment_payload(encoded) == payload
    assert decode_payment_payload(raw) == payload


@pytest.mark.asyncio
async def test_gate_payment_missing_header_returns_402() -> None:
    settlement, body, headers = await gate_payment(
        cfg=_cfg(),
        resource="https://example.com/r",
        payment_header=None,
    )
    assert settlement is None
    assert body is not None
    assert body["accepts"][0]["network"] == "casper:casper-test"
    assert headers is not None
    assert "PAYMENT-REQUIRED" in headers


@pytest.mark.asyncio
async def test_gate_payment_happy_path(monkeypatch) -> None:
    async def fake_verify(self, payload, requirements):  # noqa: ANN001
        return True, "01payer", ""

    async def fake_settle(self, payload, requirements):  # noqa: ANN001
        from app.services.casper.casper_x402_facilitator import SettlementResult

        return SettlementResult(
            success=True,
            transaction="ab" * 32,
            network="casper:casper-test",
            payer="01payer",
        )

    monkeypatch.setattr(CasperX402Facilitator, "verify", fake_verify)
    monkeypatch.setattr(CasperX402Facilitator, "settle", fake_settle)

    payload = base64.b64encode(json.dumps({"x402Version": 2}).encode()).decode()
    settlement, body, headers = await gate_payment(
        cfg=_cfg(),
        resource="https://example.com/r",
        payment_header=payload,
    )
    assert body is None
    assert headers is None
    assert settlement is not None
    assert settlement.success is True
    assert settlement.transaction == "ab" * 32


@pytest.mark.asyncio
async def test_gate_payment_verify_failure(monkeypatch) -> None:
    async def fake_verify(self, payload, requirements):  # noqa: ANN001
        return False, "", "invalid_exact_casper_payto_mismatch"

    monkeypatch.setattr(CasperX402Facilitator, "verify", fake_verify)

    payload = base64.b64encode(json.dumps({"x402Version": 2}).encode()).decode()
    settlement, body, _headers = await gate_payment(
        cfg=_cfg(),
        resource="https://example.com/r",
        payment_header=payload,
    )
    assert settlement is None
    assert body is not None
    assert "payto_mismatch" in body["error"]
