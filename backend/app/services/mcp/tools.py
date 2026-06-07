from typing import Any

from pydantic import create_model

from app.core.settings import get_settings
from app.models.tool_result import ToolResult
from app.services.adapters.runtime import DynamicAgentAdapterRegistry, RuntimeTool, TOOL_DESCRIPTIONS

ToolPayload = dict[str, Any]
McpTool = RuntimeTool


class McpToolRegistry:
    @classmethod
    def list_tools(cls) -> list[ToolPayload]:
        settings = get_settings()
        return cls._adapter(None).list_tools(settings.allowed_tools)

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
        settings = get_settings()
        selected = str(adapter_id or settings.agent_runtime_adapter or "").strip()
        return DynamicAgentAdapterRegistry.resolve(selected or DynamicAgentAdapterRegistry.default_adapter_id())
