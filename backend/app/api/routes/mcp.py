from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.security import ApiSession, require_session
from app.services.mcp.tools import McpToolRegistry, OPERATOR_TOOL_NAMES


router = APIRouter()


@router.get("/mcp")
async def mcp_info() -> dict[str, object]:
    return {
        "name": "omni-agent-fastapi-mcp-server",
        "version": "0.1.0",
        "description": "OmniAgent BSC MCP Server",
        "tools": len(McpToolRegistry.list_tools(operator=False)),
        "_meta": {"mode": "agent_wallet", "userWallet": None, "walletConnected": False},
    }


@router.post("/mcp")
async def mcp_call(request: Request, session: ApiSession = Depends(require_session)) -> dict[str, object]:
    body = await request.json()
    request_id = body.get("id")
    method = body.get("method")
    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "tools": McpToolRegistry.list_tools(operator=session.operator),
                "_meta": {"mode": "agent_wallet", "userWallet": None, "walletConnected": False},
            },
        }
    if method != "tools/call":
        raise HTTPException(status_code=400, detail="Method not found")

    params = body.get("params") or {}
    name = str(params.get("name") or "").strip()
    args = params.get("arguments") or {}
    if name in OPERATOR_TOOL_NAMES and not session.operator:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": -32004, "message": "Operator session is required for this tool"},
        }
    try:
        result = await McpToolRegistry.call_tool(name, args)
    except KeyError:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": -32003, "message": "Tool is not enabled for this deployment"},
        }
    except ValueError as exc:
        return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32603, "message": str(exc)}}

    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "result": {"content": [{"type": "text", "text": result.model_dump_json(indent=2, by_alias=True)}]},
    }
