from pathlib import Path
from typing import Any

from app.core.settings import get_settings
from app.services.casper.account import CasperAccountService


class CasperCliCommand:
    @staticmethod
    def transaction_wasm_path() -> Path | None:
        raw_path = get_settings().casper_transaction_wasm_path
        if not raw_path:
            return None
        return Path(raw_path).expanduser()

    @staticmethod
    def build_submit_command(decision: dict[str, Any]) -> list[str]:
        settings = get_settings()
        secret_path = CasperAccountService.secret_key_path()
        if secret_path is None:
            raise RuntimeError("Casper submit command requested before preflight passed.")

        command_name = settings.casper_transaction_command.strip()
        if command_name in {"put-txn", "put-transaction"}:
            return CasperCliCommand.build_transaction_command(decision, secret_path, command_name)
        return CasperCliCommand.build_deploy_command(decision, secret_path)

    @staticmethod
    def build_transaction_command(
        decision: dict[str, Any],
        secret_path: Path,
        command_name: str,
    ) -> list[str]:
        settings = get_settings()
        wasm_path = CasperCliCommand.transaction_wasm_path()
        if wasm_path is None:
            raise RuntimeError("Casper transaction Wasm requested before preflight passed.")
        command = [
            settings.casper_client_path,
            command_name,
            "session",
            "--node-address",
            CasperCliCommand.node_address(),
            "--chain-name",
            settings.casper_network,
            "--secret-key",
            str(secret_path),
            "--gas-price-tolerance",
            str(settings.casper_gas_price_tolerance),
            "--pricing-mode",
            settings.casper_pricing_mode,
            "--transaction-path",
            str(wasm_path),
            "--session-entry-point",
            settings.casper_transaction_entry_point,
            "--category",
            settings.casper_transaction_category,
        ]
        return command + CasperCliCommand.session_args(decision)

    @staticmethod
    def build_deploy_command(decision: dict[str, Any], secret_path: Path) -> list[str]:
        settings = get_settings()
        command = [
            settings.casper_client_path,
            "put-deploy",
            "--node-address",
            CasperCliCommand.node_address(),
            "--chain-name",
            settings.casper_network,
            "--secret-key",
            str(secret_path),
            "--payment-amount",
            str(settings.casper_payment_amount_motes),
            *CasperCliCommand.session_target_args(),
            "--session-entry-point",
            settings.casper_transaction_entry_point,
        ]
        return command + CasperCliCommand.session_args(decision)

    @staticmethod
    def session_args(decision: dict[str, Any]) -> list[str]:
        args = {
            "decision_id": ("string", decision.get("decisionId")),
            "action": ("string", decision.get("action")),
            "proof_digest": ("string", decision.get("proofDigest")),
            "rationale_hash": ("string", decision.get("rationaleHash")),
            "source_hash": ("string", decision.get("sourceHash")),
            "timestamp": ("string", decision.get("timestamp")),
            "risk_score": ("u64", decision.get("riskScore")),
            "policy_gate": ("string", decision.get("policyGate")),
            "agent_account_hash": ("string", decision.get("agentAccountHash")),
            "guardrail_hash": ("string", decision.get("guardrailHash")),
        }
        command_args: list[str] = []
        for name, (arg_type, value) in args.items():
            safe_value = str(value or "").replace("'", "")
            command_args.extend(["--session-arg", f"{name}:{arg_type}='{safe_value}'"])
        return command_args

    @staticmethod
    def redacted_command(command: list[str]) -> list[str]:
        settings = get_settings()
        secret_path = str(CasperAccountService.secret_key_path() or "")
        wasm_path = str(CasperCliCommand.transaction_wasm_path() or "")
        redacted: list[str] = []
        for item in command:
            if secret_path and item == secret_path:
                redacted.append("<CASPER_SECRET_KEY_PATH>")
            elif wasm_path and item == wasm_path:
                redacted.append("<CASPER_TRANSACTION_WASM_PATH>")
            elif item == settings.casper_client_path and "/" in item:
                redacted.append("<CASPER_CLIENT_PATH>")
            else:
                redacted.append(item)
        return redacted

    @staticmethod
    def status_command_name() -> str:
        return "get-transaction" if get_settings().casper_transaction_command.strip() != "put-deploy" else "get-deploy"

    @staticmethod
    def node_address() -> str:
        settings = get_settings()
        return (settings.casper_node_address or settings.casper_rpc_url).strip()

    @staticmethod
    def session_target_args() -> list[str]:
        settings = get_settings()
        if settings.casper_decision_contract_hash:
            return ["--session-hash", settings.casper_decision_contract_hash]
        return ["--session-package-hash", str(settings.casper_decision_contract_package_hash)]

    @staticmethod
    def state_root_command() -> list[str]:
        return [
            get_settings().casper_client_path,
            "get-state-root-hash",
            "--node-address",
            CasperCliCommand.node_address(),
        ]

    @staticmethod
    def query_latest_digest_command(state_root_hash: str) -> list[str]:
        settings = get_settings()
        return [
            settings.casper_client_path,
            "query-global-state",
            "--node-address",
            CasperCliCommand.node_address(),
            "--state-root-hash",
            state_root_hash,
            "--key",
            CasperCliCommand.query_key(str(settings.casper_decision_contract_hash)),
            "-q",
            "latest_proof_digest",
        ]

    @staticmethod
    def query_latest_decision_id_command(state_root_hash: str) -> list[str]:
        settings = get_settings()
        return [
            settings.casper_client_path,
            "query-global-state",
            "--node-address",
            CasperCliCommand.node_address(),
            "--state-root-hash",
            state_root_hash,
            "--key",
            CasperCliCommand.query_key(str(settings.casper_decision_contract_hash)),
            "-q",
            "latest_decision_id",
        ]

    @staticmethod
    def query_decision_receipt_command(state_root_hash: str, decision_id: str) -> list[str]:
        settings = get_settings()
        safe_decision_id = decision_id.replace("'", "").strip()
        return [
            settings.casper_client_path,
            "get-dictionary-item",
            "--node-address",
            CasperCliCommand.node_address(),
            "--state-root-hash",
            state_root_hash,
            "--contract-hash",
            CasperCliCommand.query_key(str(settings.casper_decision_contract_hash)),
            "--dictionary-name",
            "decision_receipts",
            "--dictionary-item-key",
            safe_decision_id,
        ]

    @staticmethod
    def query_key(value: str) -> str:
        if value.startswith(("hash-", "account-hash-", "uref-")):
            return value
        return f"hash-{value}"
