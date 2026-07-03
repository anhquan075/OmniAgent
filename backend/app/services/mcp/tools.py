from typing import Any

from pydantic import create_model

from app.core.settings import get_settings
from app.models.tool_result import ToolResult
from app.services.adapters.runtime import DynamicAgentAdapterRegistry, RuntimeTool, TOOL_DESCRIPTIONS
from app.services.casper.tools import CASPER_OPERATOR_TOOL_NAMES


ToolPayload = dict[str, Any]
McpTool = RuntimeTool
OPERATOR_TOOL_NAMES = set(CASPER_OPERATOR_TOOL_NAMES)


class McpToolRegistry:
    @classmethod
    def list_tools(cls, *, operator: bool = True) -> list[ToolPayload]:
        allowed_tools = get_settings().allowed_tools
        if not operator:
            allowed_tools = allowed_tools - OPERATOR_TOOL_NAMES
        return DynamicAgentAdapterRegistry.list_tools(allowed_tools)

    @classmethod
    async def call_tool(cls, name: str, args: ToolPayload) -> ToolResult:
        settings = get_settings()
        if name not in settings.allowed_tools or name not in TOOL_DESCRIPTIONS:
            raise KeyError(name)
        payload = await cls._adapter(args.get("_adapter")).call_tool(name, args)
        DynamicResult = create_model("DynamicToolResult", __base__=ToolResult)
        return DynamicResult(**payload)

    @classmethod
    async def _execute_tool(cls, name: str, args: ToolPayload) -> ToolPayload:
        if name not in TOOL_DESCRIPTIONS:
            raise KeyError(name)
        return await cls._adapter(args.get("_adapter")).call_tool(name, args)

    @classmethod
    def _adapter(cls, adapter_id: object) -> object:
        selected = str(adapter_id or get_settings().agent_runtime_adapter or "").strip()
        return DynamicAgentAdapterRegistry.resolve(selected or None)
