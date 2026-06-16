import httpx
import pytest

from app.services.twak.bridge import TrustWalletBridge
from app.services.twak.config import TrustWalletBridgeConfig


def bridge_config() -> TrustWalletBridgeConfig:
    return TrustWalletBridgeConfig(
        mode="rest",
        enabled=True,
        base_url="https://omniagent-twak-production.up.railway.app",
        api_key=None,
        timeout_ms=30_000,
        command="twak",
        access_id=None,
        hmac_secret=None,
    )


@pytest.mark.asyncio
async def test_rest_action_probe_preserves_http_status(monkeypatch) -> None:
    async def fake_list_rest_actions(*args: object, **kwargs: object) -> dict[str, object]:
        request = httpx.Request("GET", "https://omniagent-twak-production.up.railway.app/actions")
        response = httpx.Response(401, request=request)
        raise httpx.HTTPStatusError("unauthorized", request=request, response=response)

    monkeypatch.setattr("app.services.twak.bridge.TrustWalletRestClient.list_rest_actions", fake_list_rest_actions)

    result = await TrustWalletBridge.probe_rest_actions(bridge_config())

    assert result["ok"] is False
    assert result["statusCode"] == 401


def test_rest_reason_reports_bridge_auth_failure() -> None:
    reason = TrustWalletBridge.rest_reason(
        False,
        "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
        None,
        False,
        False,
        probes=[{"path": "/actions", "ok": False, "statusCode": 401}],
        base_url="https://omniagent-twak-production.up.railway.app",
    )

    assert reason == "TWAK REST bridge rejected backend auth; set matching TW_HMAC_SECRET on backend and TWAK_HMAC_SECRET on bridge."


def test_rest_reason_reports_partial_bridge_auth_failure() -> None:
    reason = TrustWalletBridge.rest_reason(
        True,
        "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
        None,
        False,
        True,
        probes=[
            {"path": "/actions", "ok": True, "statusCode": 200},
            {"path": "/actions/get_address", "ok": False, "statusCode": 401},
        ],
        base_url="https://omniagent-twak-production.up.railway.app",
    )

    assert reason == "TWAK REST bridge rejected backend auth; set matching TW_HMAC_SECRET on backend and TWAK_HMAC_SECRET on bridge."


def test_rest_reason_reports_wrong_bridge_base_url() -> None:
    reason = TrustWalletBridge.rest_reason(
        False,
        "0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25",
        None,
        False,
        False,
        probes=[{"path": "/actions", "ok": False, "statusCode": 404}],
        base_url="https://homniagent-twak-production.up.railway.app",
    )

    assert reason == (
        "TWAK REST bridge returned 404 for https://homniagent-twak-production.up.railway.app; "
        "check TRUST_WALLET_AGENT_KIT_BASE_URL."
    )
