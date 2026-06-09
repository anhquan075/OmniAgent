from collections import deque
import time
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.settings import get_settings


rate_limit_buckets: dict[str, deque[float]] = {}


class RequestSecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Any) -> Response:
        settings = get_settings()
        if settings.api_security_enabled:
            host_response = RequestSecurityMiddleware.validate_host(request, settings.trusted_hosts)
            if host_response:
                return host_response
            size_response = RequestSecurityMiddleware.validate_body_size(request, settings.api_max_body_bytes)
            if size_response:
                return RequestSecurityMiddleware.with_headers(size_response)
            rate_response = RequestSecurityMiddleware.validate_rate_limit(request)
            if rate_response:
                return RequestSecurityMiddleware.with_headers(rate_response)

        response = await call_next(request)
        return RequestSecurityMiddleware.with_headers(response)

    @staticmethod
    def validate_host(request: Request, trusted_hosts: set[str]) -> JSONResponse | None:
        if not trusted_hosts or "*" in trusted_hosts:
            return None
        host = (request.headers.get("host") or "").split(":")[0].lower()
        if host and host in trusted_hosts:
            return None
        return JSONResponse({"detail": "Host is not trusted"}, status_code=400)

    @staticmethod
    def validate_body_size(request: Request, max_body_bytes: int) -> JSONResponse | None:
        if max_body_bytes <= 0:
            return None
        content_length = request.headers.get("content-length")
        if not content_length:
            return None
        try:
            body_size = int(content_length)
        except ValueError:
            return JSONResponse({"detail": "Invalid content length"}, status_code=400)
        if body_size > max_body_bytes:
            return JSONResponse({"detail": "Request body is too large"}, status_code=413)
        return None

    @staticmethod
    def validate_rate_limit(request: Request) -> JSONResponse | None:
        settings = get_settings()
        if not settings.api_rate_limit_enabled or not request.url.path.startswith("/api"):
            return None
        limit = RequestSecurityMiddleware.limit_for(request.url.path, settings)
        window = max(1, settings.api_rate_limit_window_sec)
        if limit <= 0:
            return None
        client_host = request.client.host if request.client else "unknown"
        bucket_key = f"{client_host}:{RequestSecurityMiddleware.bucket_name(request.url.path)}"
        now = time.monotonic()
        bucket = rate_limit_buckets.setdefault(bucket_key, deque())
        while bucket and bucket[0] <= now - window:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, int(window - (now - bucket[0])))
            return JSONResponse(
                {"detail": "Rate limit exceeded", "retryAfter": retry_after},
                status_code=429,
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)
        return None

    @staticmethod
    def limit_for(path: str, settings: Any) -> int:
        if path == "/api/session":
            return settings.api_session_rate_limit_requests
        if path == "/api/mcp":
            return settings.api_mcp_rate_limit_requests
        return settings.api_rate_limit_requests

    @staticmethod
    def bucket_name(path: str) -> str:
        if path == "/api/session":
            return "session"
        if path == "/api/mcp":
            return "mcp"
        return "api"

    @staticmethod
    def with_headers(response: Response) -> Response:
        settings = get_settings()
        if not settings.api_security_headers_enabled:
            return response
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if response.headers.get("content-type", "").startswith("application/json"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response
