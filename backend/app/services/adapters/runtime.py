from typing import Any, Protocol

from app.services.casper.adapter import (
    CasperRuntimeTool as RuntimeTool,  # noqa: F401
    FastApiCasperAgentAdapter,
)
from app.services.casper.tools import CASPER_TOOL_DESCRIPTIONS


ToolPayload = dict[str, Any]
TOOL_DESCRIPTIONS: dict[str, str] = dict(CASPER_TOOL_DESCRIPTIONS)


class AgentRuntimeAdapter(Protocol):
    adapter_id: str

    def list_tools(self, allowed_tools: set[str]) -> list[ToolPayload]: ...

    async def call_tool(self, name: str, args: ToolPayload) -> ToolPayload: ...

    async def run_autonomous_cycle(self, args: ToolPayload) -> ToolPayload: ...


class DynamicAgentAdapterRegistry:
    _adapters: dict[str, AgentRuntimeAdapter] = {
        FastApiCasperAgentAdapter.adapter_id: FastApiCasperAgentAdapter(),
    }

    @classmethod
    def register(cls, adapter: AgentRuntimeAdapter) -> None:
        cls._adapters[adapter.adapter_id] = adapter

    @classmethod
    def resolve(cls, adapter_id: str | None = None) -> AgentRuntimeAdapter:
        selected = adapter_id or cls.default_adapter_id()
        adapter = cls._adapters.get(selected)
        if adapter is None:
            raise KeyError(selected)
        return adapter

    @classmethod
    def resolve_for_tool(cls, tool_name: str, adapter_id: str | None) -> AgentRuntimeAdapter:
        if tool_name not in TOOL_DESCRIPTIONS:
            raise KeyError(tool_name)
        return cls.resolve(adapter_id or cls.default_adapter_id())

    @classmethod
    def list_tools(cls, allowed_tools: set[str]) -> list[ToolPayload]:
        return cls.resolve().list_tools(allowed_tools)

    @classmethod
    def default_adapter_id(cls) -> str:
        return FastApiCasperAgentAdapter.adapter_id
