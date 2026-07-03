from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import httpx


DEFAULT_API_URL = "http://127.0.0.1:8000"


@dataclass
class ApiClient:
    base_url: str = os.getenv("OMNIAGENT_API_URL", DEFAULT_API_URL)
    operator_token: str | None = os.getenv("API_OPERATOR_TOKEN") or None

    async def health(self) -> dict[str, Any]:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=20) as client:
            response = await client.get("/api/health")
            response.raise_for_status()
            return response.json()

    async def tool(self, name: str, arguments: dict[str, Any] | None = None, timeout: float = 60) -> dict[str, Any]:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=timeout) as client:
            headers = {"X-Operator-Token": self.operator_token} if self.operator_token else None
            session = await client.get("/api/session", headers=headers)
            session.raise_for_status()
            csrf = str(session.json()["csrfToken"])
            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments or {}},
            }
            response = await client.post("/api/mcp", json=payload, headers={"X-CSRF-Token": csrf})
            response.raise_for_status()
            envelope = response.json()
            if "error" in envelope:
                raise RuntimeError(envelope["error"].get("message") or json.dumps(envelope["error"]))
            return parse_mcp_result(envelope)


def parse_mcp_result(envelope: dict[str, Any]) -> dict[str, Any]:
    content = ((envelope.get("result") or {}).get("content") or [])
    for item in content:
        if isinstance(item, dict) and item.get("type") == "text":
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                parsed = json.loads(text)
                if isinstance(parsed, dict):
                    return parsed
    return {}
