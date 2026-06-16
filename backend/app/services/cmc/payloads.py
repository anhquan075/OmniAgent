from datetime import datetime, timezone

from app.core.logging import get_logger

logger = get_logger(__name__)


def agent_hub_status_payload(
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


def agent_hub_quota_status(endpoint: str, quota_block: dict[str, object]) -> dict[str, object]:
    payload = agent_hub_status_payload(
        configured=True,
        reachable=False,
        ready=False,
        endpoint=endpoint,
        reason=str(quota_block["reason"]),
    )
    return {**payload, **quota_block}


def agent_hub_tool_summary(tool: dict[str, object]) -> dict[str, object]:
    schema = tool.get("inputSchema")
    return {
        "name": str(tool.get("name") or ""),
        "description": str(tool.get("description") or "")[:600],
        "inputSchema": schema if isinstance(schema, dict) else {},
    }


def agent_hub_call_payload(
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


def log_cmc_tool(payload: dict[str, object]) -> None:
    logger.info(
        "cmc_agent_hub_tool",
        toolName=payload.get("toolName"),
        ready=payload.get("ready"),
        reachable=payload.get("reachable"),
        reason=payload.get("reason"),
    )
