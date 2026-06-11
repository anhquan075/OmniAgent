import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass

from fastapi import Header, HTTPException, Request, Response

from app.core.settings import get_settings


COOKIE_NAME = "omni_api_session"
SIGNATURE_ALGORITHM = hashlib.sha256


@dataclass
class ApiSession:
    csrf_token: str
    expires_at: int
    operator: bool = False


def create_session(response: Response, operator_token: str | None = None) -> dict[str, int | str | bool]:
    settings = get_settings()
    csrf_token = secrets.token_urlsafe(48)
    expires_at = int(time.time() * 1000) + settings.api_session_ttl_ms
    operator = bool(
        settings.api_operator_token
        and operator_token
        and secrets.compare_digest(operator_token, settings.api_operator_token)
    )
    session = ApiSession(csrf_token=csrf_token, expires_at=expires_at, operator=operator)
    response.set_cookie(
        COOKIE_NAME,
        encode_session_cookie(session),
        max_age=settings.api_session_ttl_ms // 1000,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )
    return {"csrfToken": csrf_token, "expiresAt": expires_at, "operator": operator}


def encode_session_cookie(session: ApiSession) -> str:
    payload = json.dumps(
        {
            "csrfToken": session.csrf_token,
            "expiresAt": session.expires_at,
            "operator": session.operator,
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    encoded_payload = base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")
    signature = sign_session_payload(encoded_payload)
    return f"{encoded_payload}.{signature}"


def decode_session_cookie(cookie_value: str | None) -> ApiSession | None:
    if not cookie_value or "." not in cookie_value:
        return None
    encoded_payload, signature = cookie_value.rsplit(".", 1)
    expected_signature = sign_session_payload(encoded_payload)
    if not secrets.compare_digest(signature, expected_signature):
        return None
    try:
        padded_payload = encoded_payload + "=" * (-len(encoded_payload) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded_payload.encode("ascii")))
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
    csrf_token = payload.get("csrfToken")
    expires_at = payload.get("expiresAt")
    if not isinstance(csrf_token, str) or not csrf_token:
        return None
    try:
        expires_at_ms = int(expires_at)
    except (TypeError, ValueError):
        return None
    return ApiSession(
        csrf_token=csrf_token,
        expires_at=expires_at_ms,
        operator=payload.get("operator") is True,
    )


def sign_session_payload(encoded_payload: str) -> str:
    digest = hmac.new(
        get_settings().api_session_secret.encode("utf-8"),
        encoded_payload.encode("ascii"),
        SIGNATURE_ALGORITHM,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def require_session(
    request: Request,
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> ApiSession:
    session = decode_session_cookie(request.cookies.get(COOKIE_NAME))
    if not session or session.expires_at <= int(time.time() * 1000):
        raise HTTPException(status_code=401, detail="Valid frontend session is required")
    if request.method not in {"GET", "HEAD"} and csrf_token != session.csrf_token:
        raise HTTPException(status_code=403, detail="Valid CSRF token is required")
    return session
