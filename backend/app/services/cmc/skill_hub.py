from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.settings import get_settings
from app.services.cmc.agent_hub import CmcAgentHubClient
from app.services.cmc.agent_hub_tools import CmcAgentHubToolClient
from app.services.cmc.quota_guard import CmcQuotaGuard

SKILL_HUB_KEY_REASON = (
    "CMC_SKILL_HUB_API_KEY, CMC_MCP_API_KEY, or CMC_AGENT_HUB_API_KEY is not configured"
)
SERVER_ID = "cmc-skill-hub"
CLIENT_INFO = {"name": "omniagent-bnb-trader", "version": "0.1.0"}

class CmcSkillHubClient:
    @staticmethod
    async def get_cmc_skill_hub_status() -> dict[str, object]:
        settings = get_settings()
        api_key = settings.cmc_skill_hub_key
        endpoint = settings.cmc_skill_hub_mcp_url
        if not api_key:
            return CmcSkillHubClient.status_payload(False, False, False, endpoint, SKILL_HUB_KEY_REASON)
        quota_block = CmcQuotaGuard.active()
        if quota_block:
            return {**CmcSkillHubClient.status_payload(True, False, False, endpoint, str(quota_block["reason"])), **quota_block}
        try:
            session_id = await CmcSkillHubClient.initialize_session(endpoint, api_key)
            tools = await CmcAgentHubClient.mcp_request(endpoint, api_key, "tools/list", {}, session_id=session_id)
        except (httpx.HTTPError, ValueError) as error:
            reason = CmcQuotaGuard.reason_from_exception(error)
            if reason:
                quota_block = CmcQuotaGuard.remember(reason, settings.cmc_quota_cooldown_sec)
                return {**CmcSkillHubClient.status_payload(True, False, False, endpoint, str(quota_block["reason"])), **quota_block}
            return CmcSkillHubClient.status_payload(True, False, False, endpoint, str(error))
        tool_rows = tools.get("tools") if isinstance(tools.get("tools"), list) else []
        tool_names = [str(tool.get("name")) for tool in tool_rows if isinstance(tool, dict) and tool.get("name")]
        return CmcSkillHubClient.status_payload(
            True,
            True,
            bool({"find_skill", "execute_skill"}.issubset(set(tool_names))),
            endpoint,
            None if tool_names else "CMC Skill Hub MCP returned no tools.",
            tools=tool_names,
            tool_summaries=[CmcAgentHubClient.tool_summary(tool) for tool in tool_rows if isinstance(tool, dict)],
            tool_count=len(tool_names),
        )

    @staticmethod
    async def find_cmc_skill(args: dict[str, object]) -> dict[str, object]:
        query = str(args.get("query") or "btc price").strip()
        if not query:
            raise ValueError("CMC Skill Hub query is required.")
        return await CmcSkillHubClient.call_skill_hub_tool("find_skill", {"query": query}, timeout_sec=30)

    @staticmethod
    async def execute_cmc_skill(args: dict[str, object]) -> dict[str, object]:
        unique_name = str(args.get("unique_name") or args.get("uniqueName") or "").strip()
        if not unique_name:
            raise ValueError("CMC Skill Hub unique_name is required.")
        parameters = args.get("parameters")
        if parameters is None:
            parameters = {}
        if not isinstance(parameters, dict):
            raise ValueError("CMC Skill Hub parameters must be a JSON object.")
        return await CmcSkillHubClient.call_skill_hub_tool(
            "execute_skill",
            {"unique_name": unique_name, "parameters": parameters},
            timeout_sec=get_settings().cmc_skill_hub_tool_timeout_sec,
        )

    @staticmethod
    async def call_skill_hub_tool(tool_name: str, arguments: dict[str, object], timeout_sec: int) -> dict[str, object]:
        settings = get_settings()
        api_key = settings.cmc_skill_hub_key
        endpoint = settings.cmc_skill_hub_mcp_url
        if not api_key:
            return CmcSkillHubClient.call_payload(False, False, False, endpoint, tool_name, SKILL_HUB_KEY_REASON)
        quota_block = CmcQuotaGuard.active()
        if quota_block:
            return {**CmcSkillHubClient.call_payload(True, False, False, endpoint, tool_name, str(quota_block["reason"])), **quota_block}
        try:
            session_id = await CmcSkillHubClient.initialize_session(endpoint, api_key, timeout_sec=timeout_sec)
            result = await CmcAgentHubClient.mcp_request(
                endpoint,
                api_key,
                "tools/call",
                {"name": tool_name, "arguments": arguments},
                session_id=session_id,
                timeout_sec=timeout_sec,
            )
        except (httpx.HTTPError, ValueError) as error:
            reason = CmcQuotaGuard.reason_from_exception(error)
            if reason:
                quota_block = CmcQuotaGuard.remember(reason, settings.cmc_quota_cooldown_sec)
                return {**CmcSkillHubClient.call_payload(True, False, False, endpoint, tool_name, str(quota_block["reason"])), **quota_block}
            return CmcSkillHubClient.call_payload(True, False, False, endpoint, tool_name, str(error))
        parsed_content = CmcAgentHubToolClient.parse_tool_content(result)
        tool_error = CmcAgentHubToolClient.parsed_error_reason(parsed_content)
        quota_block = (
            CmcQuotaGuard.remember(tool_error, settings.cmc_quota_cooldown_sec)
            if CmcQuotaGuard.is_quota_reason(tool_error)
            else None
        )
        return CmcSkillHubClient.call_payload(
            True,
            True,
            tool_error is None,
            endpoint,
            tool_name,
            str(quota_block["reason"] if quota_block else tool_error) if tool_error else None,
            result=result,
            parsed_content=parsed_content,
        ) if quota_block is None else {
            **CmcSkillHubClient.call_payload(
                True, True, False, endpoint, tool_name, str(quota_block["reason"]), result=result, parsed_content=parsed_content,
            ),
            **quota_block,
        }

    @staticmethod
    async def initialize_session(endpoint: str, api_key: str, timeout_sec: int = 30) -> str | None:
        initialize = await CmcAgentHubClient.mcp_request(
            endpoint,
            api_key,
            "initialize",
            {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": CLIENT_INFO},
            timeout_sec=timeout_sec,
        )
        session_id = str(initialize.get("sessionId") or "") or None
        await CmcAgentHubClient.mcp_notification(
            endpoint,
            api_key,
            "notifications/initialized",
            {},
            session_id=session_id,
            timeout_sec=timeout_sec,
        )
        return session_id

    @staticmethod
    def status_payload(
        configured: bool,
        reachable: bool,
        ready: bool,
        endpoint: str,
        reason: str | None,
        *,
        tools: list[str] | None = None,
        tool_summaries: list[dict[str, object]] | None = None,
        tool_count: int = 0,
    ) -> dict[str, object]:
        return {
            "source": "coinmarketcap-skill-hub-mcp",
            "serverId": SERVER_ID,
            "transport": "streamable_http",
            "configured": configured,
            "reachable": reachable,
            "ready": ready,
            "endpoint": endpoint,
            "tools": tools or [],
            "toolSummaries": tool_summaries or [],
            "toolCount": tool_count,
            "timeoutSec": get_settings().cmc_skill_hub_tool_timeout_sec,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "reason": reason,
        }

    @staticmethod
    def call_payload(
        configured: bool,
        reachable: bool,
        ready: bool,
        endpoint: str,
        tool_name: str,
        reason: str | None,
        *,
        result: dict[str, Any] | None = None,
        parsed_content: object = None,
    ) -> dict[str, object]:
        return {
            "source": "coinmarketcap-skill-hub-mcp",
            "serverId": SERVER_ID,
            "transport": "streamable_http",
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
