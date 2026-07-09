from pathlib import Path
from typing import Any

from app.core.settings import BACKEND_ROOT, REPO_ROOT, get_settings
from app.services.casper.account import CasperAccountService
from app.services.casper.cli_command import CasperCliCommand
from app.services.casper.cspr_cloud import CsprCloudClient
from app.services.casper.submitter import CasperCliSubmitter


class CasperPreflightService:
    @staticmethod
    def get_live_preflight(_: dict[str, Any] | None = None) -> dict[str, Any]:
        settings = get_settings()
        account = CasperAccountService.get_account({})
        client_available = CasperCliSubmitter.is_client_available()
        rpc_probe = CasperPreflightService.rpc_probe(client_available)
        account_balance = CasperPreflightService.account_balance(account, client_available)
        hard_blockers = CasperPreflightService.hard_blockers(
            account,
            client_available,
            rpc_probe,
            account_balance,
        )
        warnings = CasperPreflightService.warnings(account, account_balance)
        return {
            "network": "casper",
            "status": "blocked" if hard_blockers else "ready",
            "chain": settings.casper_network,
            "rpcUrl": settings.casper_rpc_url,
            "rpcReachable": rpc_probe["reachable"],
            "rpcProbe": rpc_probe,
            "explorerUrl": settings.casper_explorer_url,
            "account": account,
            "accountBalance": account_balance,
            "hardBlockers": hard_blockers,
            "warnings": warnings,
            "liveSubmitEnabled": bool(settings.casper_live_submit_enabled and not hard_blockers),
        }

    @staticmethod
    def hard_blockers(
        account: dict[str, Any],
        client_available: bool,
        rpc_probe: dict[str, Any],
        account_balance: dict[str, Any] | None = None,
    ) -> list[str]:
        settings = get_settings()
        blockers: list[str] = []
        if not account.get("configured"):
            blockers.append("casper_account_missing")
        signer = account.get("signer") if isinstance(account.get("signer"), dict) else {}
        secret_path = CasperAccountService.secret_key_path()
        if not signer.get("configured"):
            blockers.append("casper_secret_key_path_missing")
        elif not signer.get("pathExists"):
            blockers.append("casper_secret_key_unreadable")
        elif secret_path and not secret_path.is_file():
            blockers.append("casper_secret_key_unreadable")
        elif secret_path and not CasperPreflightService.is_outside_repo(secret_path):
            blockers.append("casper_secret_key_in_repo")
        if not settings.casper_decision_contract_hash:
            blockers.append("casper_decision_contract_hash_missing")
        if not settings.casper_decision_contract_package_hash:
            blockers.append("casper_decision_contract_package_hash_missing")
        if settings.casper_live_submit_enabled:
            if not client_available:
                blockers.append("casper_client_missing")
            elif not rpc_probe["reachable"]:
                blockers.append("casper_rpc_unreachable")
            balance_motes = CasperPreflightService.balance_motes(account_balance)
            if balance_motes is not None and balance_motes < settings.casper_payment_amount_motes:
                blockers.append("casper_account_balance_insufficient")
            if settings.casper_transaction_command.strip() != "put-deploy":
                wasm_path = CasperCliCommand.transaction_wasm_path()
                if not settings.casper_transaction_wasm_path:
                    blockers.append("casper_transaction_wasm_path_missing")
                elif not wasm_path or not wasm_path.exists():
                    blockers.append("casper_transaction_wasm_unreadable")
        else:
            blockers.append("casper_live_submit_disabled")
        return blockers

    @staticmethod
    def warnings(account: dict[str, Any], account_balance: dict[str, Any] | None = None) -> list[str]:
        settings = get_settings()
        warnings: list[str] = []
        if not account.get("rpcUrl"):
            warnings.append("casper_rpc_url_missing")
        if account_balance and float(account_balance.get("cspr", 0) or 0) < settings.casper_min_balance_cspr:
            warnings.append("casper_account_balance_low")
        return warnings

    @staticmethod
    def rpc_probe(client_available: bool) -> dict[str, Any]:
        settings = get_settings()
        if not client_available and settings.casper_cspr_cloud_api_key:
            block_height = CsprCloudClient.get_block_height()
            return {
                "reachable": block_height is not None,
                "source": "cspr_cloud",
                "blockHeight": block_height,
                "hardBlockers": [] if block_height is not None else ["casper_cspr_cloud_unreachable"],
            }
        if not settings.casper_live_submit_enabled or not client_available:
            return {"reachable": False, "skipped": True, "hardBlockers": []}
        result = CasperCliSubmitter.get_state_root_hash()
        return {
            "reachable": not result.get("hardBlockers"),
            "source": result.get("source", "casper_client"),
            "stateRootHash": result.get("stateRootHash"),
            "hardBlockers": result.get("hardBlockers") or [],
            "cliCommand": result.get("cliCommand"),
        }

    @staticmethod
    def account_balance(account: dict[str, Any], client_available: bool) -> dict[str, Any] | None:
        public_key = str(account.get("publicKey") or "")
        cloud_balance = CsprCloudClient.get_account_balance(public_key)
        if cloud_balance is not None:
            return {**cloud_balance, "source": "cspr_cloud"}
        if client_available:
            return CasperCliSubmitter.query_account_balance(public_key)
        return None

    @staticmethod
    def balance_motes(account_balance: dict[str, Any] | None) -> int | None:
        if not isinstance(account_balance, dict):
            return None
        value = account_balance.get("motes")
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @staticmethod
    def is_outside_repo(path: object) -> bool:
        try:
            repo_root = REPO_ROOT.resolve()
            if repo_root == Path(repo_root.anchor):
                repo_root = BACKEND_ROOT.resolve()
            return not Path(path).resolve().is_relative_to(repo_root)
        except (OSError, RuntimeError, ValueError):
            return False
