import secrets
import time
from dataclasses import dataclass

from fastapi import Header, HTTPException, Request, Response

from app.core.settings import get_settings


COOKIE_NAME = "omni_api_session"


@dataclass
class ApiSession:
    csrf_token: str
    expires_at: int


sessions: dict[str, ApiSession] = {}


def create_session(response: Response) -> dict[str, int | str]:
    settings = get_settings()
    session_id = secrets.token_urlsafe(48)
    csrf_token = secrets.token_urlsafe(48)
    expires_at = int(time.time() * 1000) + settings.api_session_ttl_ms
    sessions[session_id] = ApiSession(csrf_token=csrf_token, expires_at=expires_at)
    response.set_cookie(
        COOKIE_NAME,
        session_id,
        max_age=settings.api_session_ttl_ms // 1000,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )
    return {"csrfToken": csrf_token, "expiresAt": expires_at}


def require_session(request: Request, csrf_token: str | None = Header(default=None, alias="X-CSRF-Token")) -> None:
    session_id = request.cookies.get(COOKIE_NAME)
    session = sessions.get(session_id or "")
    if not session or session.expires_at <= int(time.time() * 1000):
        if session_id:
            sessions.pop(session_id, None)
        raise HTTPException(status_code=401, detail="Valid frontend session is required")
    if request.method not in {"GET", "HEAD"} and csrf_token != session.csrf_token:
        raise HTTPException(status_code=403, detail="Valid CSRF token is required")
