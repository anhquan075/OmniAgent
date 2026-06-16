import json
import re

import httpx

from app.core.settings import get_settings
from app.services.cmc.payloads import agent_hub_call_payload, log_cmc_tool as log_cmc_tool_payload
from app.services.cmc.prices import CMC_KEY_REASON
from app.services.cmc.agent_hub import CmcAgentHubClient
from app.services.cmc.quota_guard import CmcQuotaGuard
from app.services.cmc.response_cache import CmcResponseCache

TOOL_NAME_RE = re.compile(r"^[A-Za-z0-9_.:/-]{1,160}$")
MAX_ARGUMENT_BYTES = 20_000
_TOOL_CALL_CACHE = CmcResponseCache()


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
        quota_block = CmcQuotaGuard.active()
        if quota_block:
            payload = CmcAgentHubToolClient.call_payload(
                configured=True,
                reachable=False,
                ready=False,
                endpoint=endpoint,
                tool_name=tool_name,
                reason=str(quota_block["reason"]),
            )
            CmcAgentHubToolClient.log_cmc_tool(payload)
            return {**payload, **quota_block}
        cache_key = CmcResponseCache.key(endpoint, api_key, tool_name, arguments)
        cached = _TOOL_CALL_CACHE.get(cache_key, settings.cmc_agent_hub_signal_cache_ttl_sec)
        if cached:
            CmcAgentHubToolClient.log_cmc_tool(cached)
            return cached
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
            reason = CmcQuotaGuard.reason_from_exception(error)
            quota_block = CmcQuotaGuard.remember(reason, settings.cmc_quota_cooldown_sec) if reason else None
            payload = CmcAgentHubToolClient.call_payload(
                configured=True,
                reachable=False,
                ready=False,
                endpoint=endpoint,
                tool_name=tool_name,
                reason=str(quota_block["reason"] if quota_block else error),
            )
            CmcAgentHubToolClient.log_cmc_tool(payload)
            return {**payload, **quota_block} if quota_block else payload
        parsed_content = CmcAgentHubToolClient.parse_tool_content(result)
        tool_error = CmcAgentHubToolClient.parsed_error_reason(parsed_content)
        quota_block = (
            CmcQuotaGuard.remember(tool_error, settings.cmc_quota_cooldown_sec)
            if CmcQuotaGuard.is_quota_reason(tool_error)
            else None
        )
        payload = CmcAgentHubToolClient.call_payload(
            configured=True,
            reachable=True,
            ready=tool_error is None,
            endpoint=endpoint,
            tool_name=tool_name,
            reason=str(quota_block["reason"] if quota_block else tool_error) if tool_error else None,
            result=result,
            parsed_content=parsed_content,
        )
        if tool_error is None:
            _TOOL_CALL_CACHE.set(cache_key, payload)
        CmcAgentHubToolClient.log_cmc_tool(payload)
        return {**payload, **quota_block} if quota_block else payload

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
    def parsed_error_reason(value: object) -> str | None:
        if isinstance(value, list):
            for item in value[:16]:
                reason = CmcAgentHubToolClient.parsed_error_reason(item)
                if reason:
                    return reason
            return None
        if isinstance(value, dict):
            error = value.get("error")
            if isinstance(error, dict):
                message = str(error.get("message") or error.get("reason") or "").strip()
                code = str(error.get("code") or "").strip()
                prefix = f"CMC Agent Hub error {code}: " if code else "CMC Agent Hub error: "
                return prefix + (message or "Tool returned an error payload.")
            status = str(value.get("status") or "").strip().lower()
            if status == "error":
                message = str(value.get("message") or value.get("reason") or "").strip()
                return message or "CMC Agent Hub tool returned an error payload."
            return None
        if isinstance(value, str):
            lowered = value.lower()
            if "credit limit" in lowered or "rate limit" in lowered:
                return value.strip()
        return None

    call_payload = staticmethod(agent_hub_call_payload)
    log_cmc_tool = staticmethod(log_cmc_tool_payload)
