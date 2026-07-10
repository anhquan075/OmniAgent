import base64
import json

from app.core.security import (
    ApiSession,
    decode_session_cookie,
    encode_session_cookie,
    sign_session_payload,
)
from app.core.settings import get_settings


def test_current_session_cookie_round_trips() -> None:
    session = ApiSession(csrf_token="csrf", expires_at=9_999_999_999_999, operator=True)

    decoded = decode_session_cookie(encode_session_cookie(session))

    assert decoded == session


def test_legacy_implicit_operator_cookie_is_invalidated() -> None:
    legacy_payload = base64.urlsafe_b64encode(
        json.dumps(
            {"csrfToken": "csrf", "expiresAt": 9_999_999_999_999, "operator": True},
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    ).decode("ascii").rstrip("=")
    legacy_cookie = f"{legacy_payload}.{sign_session_payload(legacy_payload)}"

    assert decode_session_cookie(legacy_cookie) is None


def test_operator_token_rotation_invalidates_existing_session(monkeypatch) -> None:
    monkeypatch.setenv("API_OPERATOR_TOKEN", "first-operator-token")
    get_settings.cache_clear()
    cookie = encode_session_cookie(
        ApiSession(csrf_token="csrf", expires_at=9_999_999_999_999, operator=True)
    )

    monkeypatch.setenv("API_OPERATOR_TOKEN", "rotated-operator-token")
    get_settings.cache_clear()

    assert decode_session_cookie(cookie) is None
