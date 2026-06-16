from datetime import datetime, timezone
import json
from typing import Any
from uuid import uuid4

import httpx

from app.core.settings import get_settings
from app.services.cmc.prices import CMC_KEY_REASON
from app.services.cmc.quota_guard import CmcQuotaGuard


class CmcAgentHubClient:
    @staticmethod
    async def get_cmc_agent_hub_status() -> dict[str, object]:
        settings = get_settings()
        api_key = settings.cmc_api_key
        endpoint = settings.cmc_mcp_url
        if not api_key:
            return CmcAgentHubClient.status_payload(
                configured=False,
                reachable=False,
                ready=False,
                endpoint=endpoint,
                reason=CMC_KEY_REASON,
            )
        quota_block = CmcQuotaGuard.active()
        if quota_block:
            return CmcAgentHubClient.quota_status(endpoint, quota_block)
        try:
            initialize = await CmcAgentHubClient.mcp_request(endpoint, api_key, "initialize", {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "omniagent-bnb-trader", "version": "0.1.0"},
            })
            session_id = str(initialize.get("sessionId") or "") or None
            await CmcAgentHubClient.mcp_notification(
                endpoint,
                api_key,
                "notifications/initialized",
                {},
                session_id=session_id,
            )
            tools = await CmcAgentHubClient.mcp_request(
                endpoint,
                api_key,
                "tools/list",
                {},
                session_id=session_id,
            )
        except (httpx.HTTPError, ValueError) as error:
            reason = CmcQuotaGuard.reason_from_exception(error)
            if reason:
                quota_block = CmcQuotaGuard.remember(reason, settings.cmc_quota_cooldown_sec)
                return CmcAgentHubClient.quota_status(endpoint, quota_block)
            return CmcAgentHubClient.status_payload(
                configured=True,
                reachable=False,
                ready=False,
                endpoint=endpoint,
                reason=str(error),
            )
        tool_rows = tools.get("tools") if isinstance(tools.get("tools"), list) else []
        tool_names = [
            str(tool.get("name"))
            for tool in tool_rows
            if isinstance(tool, dict) and tool.get("name")
        ]
        tool_summaries = [CmcAgentHubClient.tool_summary(tool) for tool in tool_rows if isinstance(tool, dict)]
        return CmcAgentHubClient.status_payload(
            configured=True,
            reachable=True,
            ready=bool(tool_names),
            endpoint=endpoint,
            tools=tool_names,
            toolSummaries=tool_summaries,
            toolCount=len(tool_names),
            reason=None if tool_names else "CMC Agent Hub MCP returned no tools.",
        )

    @staticmethod
    async def mcp_request(
        endpoint: str,
        api_key: str,
        method: str,
        params: dict[str, object],
        session_id: str | None = None,
        timeout_sec: int = 15,
    ) -> dict[str, Any]:
        headers = CmcAgentHubClient.mcp_headers(api_key, session_id)
        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            response = await client.post(
                endpoint,
                headers=headers,
                json={"jsonrpc": "2.0", "id": str(uuid4()), "method": method, "params": params},
            )
            response.raise_for_status()
        payload = CmcAgentHubClient.parse_mcp_response(response.text)
        if "error" in payload:
            raise ValueError(str(payload["error"]))
        result = payload.get("result")
        if not isinstance(result, dict):
            raise ValueError(f"CMC Agent Hub MCP {method} did not return an object result.")
        if method == "initialize":
            response_session_id = response.headers.get("Mcp-Session-Id")
            if response_session_id:
                result = {**result, "sessionId": response_session_id}
        return result

    @staticmethod
    async def mcp_notification(
        endpoint: str,
        api_key: str,
        method: str,
        params: dict[str, object],
        session_id: str | None = None,
        timeout_sec: int = 15,
    ) -> None:
        headers = CmcAgentHubClient.mcp_headers(api_key, session_id)
        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            response = await client.post(
                endpoint,
                headers=headers,
                json={"jsonrpc": "2.0", "method": method, "params": params},
            )
            response.raise_for_status()
        if not response.text.strip():
            return
        payload = CmcAgentHubClient.parse_mcp_response(response.text)
        if "error" in payload:
            raise ValueError(str(payload["error"]))

    @staticmethod
    def mcp_headers(api_key: str, session_id: str | None = None) -> dict[str, str]:
        headers = {
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
            "X-CMC-MCP-API-KEY": api_key,
        }
        if session_id:
            headers["Mcp-Session-Id"] = session_id
        return headers

    @staticmethod
    def parse_mcp_response(text: str) -> dict[str, Any]:
        stripped = text.strip()
        if not stripped:
            raise ValueError("CMC Agent Hub MCP returned an empty response.")
        if stripped.startswith("{"):
            payload = json.loads(stripped)
            return payload if isinstance(payload, dict) else {}
        for line in reversed(stripped.splitlines()):
            line = line.strip()
            if line.startswith("data:"):
                payload = json.loads(line.removeprefix("data:").strip())
                return payload if isinstance(payload, dict) else {}
        raise ValueError("CMC Agent Hub MCP returned an unsupported response format.")

    @staticmethod
    def status_payload(
        *,
        configured: bool,
        reachable: bool,
        ready: bool,
        endpoint: str,
        reason: str | None,
        tools: list[str] | None = None,
        toolSummaries: list[dict[str, object]] | None = None,
        toolCount: int = 0,
    ) -> dict[str, object]:
        return {
            "source": "coinmarketcap-agent-hub-mcp",
            "configured": configured,
            "reachable": reachable,
            "ready": ready,
            "endpoint": endpoint,
            "tools": tools or [],
            "toolSummaries": toolSummaries or [],
            "toolCount": toolCount,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "reason": reason,
        }

    @staticmethod
    def quota_status(endpoint: str, quota_block: dict[str, object]) -> dict[str, object]:
        payload = CmcAgentHubClient.status_payload(configured=True, reachable=False, ready=False, endpoint=endpoint, reason=str(quota_block["reason"]))
        return {**payload, **quota_block}

    @staticmethod
    def tool_summary(tool: dict[str, object]) -> dict[str, object]:
        schema = tool.get("inputSchema")
        return {
            "name": str(tool.get("name") or ""),
            "description": str(tool.get("description") or "")[:600],
            "inputSchema": schema if isinstance(schema, dict) else {},
        }
