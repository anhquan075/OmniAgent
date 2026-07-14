from dataclasses import dataclass
from typing import Type

from app.services.adapters.runtime import DynamicAgentAdapterRegistry
from app.services.casper.account import CasperAccountService
from app.services.casper.adapter import FastApiCasperAgentAdapter
from app.services.casper.contract import CasperDecisionContractService
from app.services.casper.ledger import CasperDecisionLedger
from app.services.casper.preflight import CasperPreflightService
from app.services.casper.proof_bundle import CasperProofBundleService
from app.services.casper.runtime import CasperAgentRuntimeService
from app.services.mcp.tools import McpToolRegistry


@dataclass(frozen=True)
class ServiceContainer:
    adapter_registry: Type[DynamicAgentAdapterRegistry] = DynamicAgentAdapterRegistry
    casper_account: Type[CasperAccountService] = CasperAccountService
    casper_adapter: Type[FastApiCasperAgentAdapter] = FastApiCasperAgentAdapter
    casper_contract: Type[CasperDecisionContractService] = CasperDecisionContractService
    casper_ledger: Type[CasperDecisionLedger] = CasperDecisionLedger
    casper_preflight: Type[CasperPreflightService] = CasperPreflightService
    casper_proof_bundle: Type[CasperProofBundleService] = CasperProofBundleService
    casper_runtime: Type[CasperAgentRuntimeService] = CasperAgentRuntimeService
    mcp_tools: Type[McpToolRegistry] = McpToolRegistry

    @classmethod
    def default(cls) -> "ServiceContainer":
        return cls()
