from typing import Any

from app.core.settings import get_settings


class BnbAgentSdkRuntimeService:
    MODULES = ("erc8004", "erc8183")

    @staticmethod
    def get_facade_snapshot(wallet_address: str | None, sdk_status: dict[str, Any]) -> dict[str, object]:
        settings = get_settings()
        snapshot: dict[str, object] = {
            "package": "bnbagent",
            "version": sdk_status.get("version"),
            "facade": "BNBAgent",
            "config": "BNBAgentConfig",
            "role": "core_runtime",
            "network": settings.bnb_agent_sdk_network,
            "executor": "twak",
            "sdkExecutesTrades": False,
            "usesOfficialFacade": False,
            "coreRuntime": False,
            "facadeInitialized": False,
            "facadeReady": False,
            "walletProvider": "none-read-only",
            "secretMaterialLoaded": False,
            "modulesRequested": list(BnbAgentSdkRuntimeService.MODULES),
            "modulesInitialized": [],
            "moduleDetails": [],
            "actionsExposed": 0,
            "contracts": BnbAgentSdkRuntimeService.contracts(settings.bnb_agent_sdk_network, sdk_status),
            "commerceServer": {
                "mounted": False,
                "fundedJobPolling": False,
                "reason": "ERC-8183 server polling is not mounted; TWAK remains the only trade executor.",
            },
            "reason": sdk_status.get("reason"),
        }
        if not sdk_status.get("installed"):
            snapshot["reason"] = "Python package bnbagent is not installed"
            return snapshot
        try:
            from bnbagent import BNBAgent
            from bnbagent import BNBAgentConfig
        except Exception as exc:
            snapshot["reason"] = f"BNB Agent SDK facade import failed: {exc}"
            return snapshot

        snapshot["usesOfficialFacade"] = True
        agent = None
        try:
            config = BNBAgentConfig(
                network=settings.bnb_agent_sdk_network,
                wallet_address=wallet_address or sdk_status.get("walletAddress") or "",
                settings={
                    "runtime_role": "core_runtime",
                    "executor": "twak",
                    "sdk_executes_trades": False,
                },
            )
            agent = BNBAgent(config, modules=list(BnbAgentSdkRuntimeService.MODULES))
            modules = list(agent.registry.module_names)
            snapshot["modulesInitialized"] = modules
            snapshot["moduleDetails"] = [BnbAgentSdkRuntimeService.module_detail(agent, name) for name in modules]
            snapshot["actionsExposed"] = len(agent.actions())
            snapshot["facadeInitialized"] = True
            snapshot["coreRuntime"] = True
            snapshot["facadeReady"] = bool(sdk_status.get("ready"))
            if not sdk_status.get("ready"):
                snapshot["reason"] = sdk_status.get("reason") or "BNB Agent SDK is initialized but not enabled."
        except Exception as exc:
            snapshot["reason"] = f"BNB Agent SDK facade initialization failed: {exc}"
        finally:
            if agent is not None:
                try:
                    agent.shutdown()
                except Exception:
                    pass
        return snapshot

    @staticmethod
    def contracts(network: str, sdk_status: dict[str, Any]) -> dict[str, object]:
        contracts: dict[str, object] = {
            "identityRegistry": sdk_status.get("registryAddress"),
            "agenticCommerce": None,
            "evaluatorRouter": None,
            "optimisticPolicy": None,
        }
        try:
            from bnbagent.config import resolve_network

            config = resolve_network(network)
            contracts.update(
                {
                    "identityRegistry": getattr(config, "registry_contract", None),
                    "agenticCommerce": getattr(config, "commerce_contract", None),
                    "evaluatorRouter": getattr(config, "router_contract", None),
                    "optimisticPolicy": getattr(config, "policy_contract", None),
                }
            )
        except Exception:
            pass
        return contracts

    @staticmethod
    def module_detail(agent: Any, name: str) -> dict[str, object]:
        module = agent.module(name)
        if module is None:
            return {"name": name, "ready": False}
        info = module.info()
        return {
            "name": getattr(info, "name", name),
            "version": getattr(info, "version", None),
            "description": getattr(info, "description", None),
            "dependencies": list(getattr(info, "dependencies", ()) or ()),
            "ready": True,
        }
