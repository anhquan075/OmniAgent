from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from app.services.casper.account import CasperAccountService
from app.services.casper.contract import CasperDecisionContractService
from app.services.casper.preflight import CasperPreflightService
from app.services.casper.proof_bundle import CasperProofBundleService
from app.services.casper.receipt import CasperDecisionReceiptService
from app.services.casper.readback import CasperReadbackService
from app.services.casper.runtime import CasperAgentRuntimeService
from app.services.casper.tools import CASPER_TOOL_DESCRIPTIONS

ToolPayload = dict[str, Any]
ToolHandler = Callable[[ToolPayload], ToolPayload | Awaitable[ToolPayload]]


@dataclass(frozen=True)
class CasperRuntimeTool:
    name: str
    description: str
    handler: ToolHandler

    def metadata(self) -> ToolPayload:
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": {"type": "object", "properties": {}, "additionalProperties": True},
        }

    async def run(self, args: ToolPayload) -> ToolPayload:
        result = self.handler(args)
        if hasattr(result, "__await__"):
            return await result
        return result


class FastApiCasperAgentAdapter:
    adapter_id = "fastapi-casper-agent"

    def list_tools(self, allowed_tools: set[str]) -> list[ToolPayload]:
        return [tool.metadata() for name, tool in self.tools().items() if name in allowed_tools]

    async def call_tool(self, name: str, args: ToolPayload) -> ToolPayload:
        tool = self.tools().get(name)
        if tool is None:
            raise KeyError(name)
        return await tool.run(args)

    async def run_autonomous_cycle(self, args: ToolPayload) -> ToolPayload:
        return CasperAgentRuntimeService.run_autonomous_cycle(args)

    def tools(self) -> dict[str, CasperRuntimeTool]:
        handlers: dict[str, ToolHandler] = {
            "casper_agent_cockpit_snapshot": CasperAgentRuntimeService.get_cockpit_snapshot,
            "casper_get_account": CasperAccountService.get_account,
            "casper_runtime_snapshot": CasperAgentRuntimeService.get_runtime_snapshot,
            "casper_live_preflight": CasperPreflightService.get_live_preflight,
            "casper_run_autonomous_cycle": self.run_autonomous_cycle,
            "casper_live_proof_bundle": CasperProofBundleService.get_live_proof_bundle,
            "casper_get_deploy_status": CasperDecisionContractService.get_deploy_status,
            "casper_get_decision_receipt": CasperDecisionReceiptService.get_decision_receipt,
            "casper_verify_decision_receipt": CasperDecisionReceiptService.verify_decision_receipt,
            "casper_record_decision": CasperDecisionContractService.record_decision,
            "casper_record_readback": CasperReadbackService.record_readback,
        }
        return {
            name: CasperRuntimeTool(name, CASPER_TOOL_DESCRIPTIONS[name], handler)
            for name, handler in handlers.items()
        }
