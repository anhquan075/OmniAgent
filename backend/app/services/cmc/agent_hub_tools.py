from datetime import datetime, timezone
import json
import re

import httpx

from app.core.logging import get_logger
from app.core.settings import get_settings
from app.services.cmc.prices import CMC_KEY_REASON
from app.services.cmc.agent_hub import CmcAgentHubClient

logger = get_logger(__name__)

TOOL_NAME_RE = re.compile(r"^[A-Za-z0-9_.:/-]{1,160}$")
MAX_ARGUMENT_BYTES = 20_000

class CmcAgentHubToolClient:
    @staticmethod
    async def call_cmc_agent_hub_tool(args: dict[str, object]) -> dict[str, object]:
        settings = get_settings()
        api_key = settings.cmc_api_key
        endpoint = settings.cmc_mcp_url
        tool_name = CmcAgentHubToolClient.normalize_tool_name(args.get("toolName") or args.get("name"))
        arguments = CmcAgentHubToolClient.normalize_arguments(args.get("arguments"))
        if not api_key:
            payload = CmcAgentHubToolClient.call_payload(
                configured=False,
                reachable=False,
                ready=False,
                endpoint=endpoint,
                tool_name=tool_name,
                reason=CMC_KEY_REASON,
            )
            CmcAgentHubToolClient.log_cmc_tool(payload)
            return payload
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
            result = await CmcAgentHubClient.mcp_request(
                endpoint,
                api_key,
                "tools/call",
                {"name": tool_name, "arguments": arguments},
                session_id=session_id,
            )
        except (httpx.HTTPError, ValueError) as error:
            payload = CmcAgentHubToolClient.call_payload(
                configured=True,
                reachable=False,
                ready=False,
                endpoint=endpoint,
                tool_name=tool_name,
                reason=str(error),
            )
            CmcAgentHubToolClient.log_cmc_tool(payload)
            return payload
        payload = CmcAgentHubToolClient.call_payload(
            configured=True,
            reachable=True,
            ready=True,
            endpoint=endpoint,
            tool_name=tool_name,
            reason=None,
            result=result,
            parsed_content=CmcAgentHubToolClient.parse_tool_content(result),
        )
        CmcAgentHubToolClient.log_cmc_tool(payload)
        return payload

    @staticmethod
    def normalize_tool_name(value: object) -> str:
        tool_name = str(value or "").strip()
        if not TOOL_NAME_RE.match(tool_name):
            raise ValueError("CMC Agent Hub toolName must be 1-160 safe MCP name characters.")
        return tool_name

    @staticmethod
    def normalize_arguments(value: object) -> dict[str, object]:
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise ValueError("CMC Agent Hub arguments must be a JSON object.")
        encoded = json.dumps(value, separators=(",", ":"), sort_keys=True)
        if len(encoded.encode("utf-8")) > MAX_ARGUMENT_BYTES:
            raise ValueError("CMC Agent Hub arguments exceed the 20 KB safety limit.")
        return value

    @staticmethod
    def parse_tool_content(result: dict[str, object]) -> object:
        content = result.get("content")
        if not isinstance(content, list):
            return None
        parsed: list[object] = []
        for item in content:
            if not isinstance(item, dict) or item.get("type") != "text":
                continue
            text = item.get("text")
            if not isinstance(text, str):
                continue
            try:
                parsed.append(json.loads(text))
            except json.JSONDecodeError:
                parsed.append(text)
        return parsed or None

    @staticmethod
    def call_payload(
        *,
        configured: bool,
        reachable: bool,
        ready: bool,
        endpoint: str,
        tool_name: str,
        reason: str | None,
        result: dict[str, object] | None = None,
        parsed_content: object = None,
    ) -> dict[str, object]:
        return {
            "source": "coinmarketcap-agent-hub-mcp",
            "configured": configured,
            "reachable": reachable,
            "ready": ready,
            "endpoint": endpoint,
            "toolName": tool_name,
            "result": result or {},
            "parsedContent": parsed_content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "reason": reason,
        }

    @staticmethod
    def log_cmc_tool(payload: dict[str, object]) -> None:
        logger.info(
            "cmc_agent_hub_tool",
            toolName=payload.get("toolName"),
            ready=payload.get("ready"),
            reachable=payload.get("reachable"),
            reason=payload.get("reason"),
        )
