from pathlib import Path
import shutil
import subprocess
from typing import Any

from app.core.settings import get_settings
from app.services.casper.cli_command import CasperCliCommand
from app.services.casper.cli_output import CasperCliOutput
from app.services.casper.client import CasperJsonRpcClient


class CasperCliSubmitter:
    @staticmethod
    def is_client_available() -> bool:
        client_path = get_settings().casper_client_path.strip()
        if not client_path:
            return False
        if "/" in client_path:
            return Path(client_path).expanduser().exists()
        return shutil.which(client_path) is not None

    @staticmethod
    def submit_decision(decision: dict[str, Any]) -> dict[str, Any]:
        settings = get_settings()
        command = CasperCliCommand.build_submit_command(decision)
        result = CasperCliSubmitter.run_command(command, "casper_cli_submit")
        if result["hardBlockers"]:
            return CasperCliSubmitter.failure(result["hardBlockers"][0], result["cliCommand"], result.get("cliOutput"))

        transaction_hash = CasperCliOutput.extract_hash(str(result.get("cliOutput") or ""))
        if not transaction_hash:
            return CasperCliSubmitter.failure(
                "casper_cli_transaction_hash_missing",
                result["cliCommand"],
                str(result.get("cliOutput") or ""),
            )

        explorer = settings.casper_explorer_url.rstrip("/")
        return {
            "submitted": True,
            "status": "submitted",
            "transactionHash": transaction_hash,
            "deployHash": transaction_hash,
            "explorerUrl": f"{explorer}/deploy/{transaction_hash}",
            "transactionExplorerUrl": f"{explorer}/transaction/{transaction_hash}",
            "hardBlockers": [],
            "cliCommand": result["cliCommand"],
        }

    @staticmethod
    def get_transaction_status(transaction_hash: str) -> dict[str, Any]:
        command = [
            get_settings().casper_client_path,
            CasperCliCommand.status_command_name(),
            "--node-address",
            CasperCliCommand.node_address(),
            transaction_hash,
        ]
        result = CasperCliSubmitter.run_command(command, "casper_cli_status")
        if result["hardBlockers"]:
            return {"status": "unverified", **result}
        status = CasperCliOutput.extract_execution_status(str(result.get("cliOutput") or ""))
        return {
            "status": status,
            "hardBlockers": [] if status == "confirmed" else ["casper_deploy_not_confirmed"],
            "cliCommand": result["cliCommand"],
        }

    @staticmethod
    def get_state_root_hash() -> dict[str, Any]:
        if not CasperCliSubmitter.is_client_available():
            state_root_hash = CasperJsonRpcClient.get_state_root_hash_sync()
            if not state_root_hash:
                return {
                    "status": "blocked",
                    "source": "casper_json_rpc_state_root",
                    "hardBlockers": ["casper_state_root_hash_missing"],
                }
            return {
                "status": "ready",
                "source": "casper_json_rpc_state_root",
                "hardBlockers": [],
                "stateRootHash": state_root_hash,
            }
        result = CasperCliSubmitter.run_command(CasperCliCommand.state_root_command(), "casper_cli_state_root")
        if result["hardBlockers"]:
            return result
        state_root_hash = CasperCliOutput.extract_state_root_hash(str(result.get("cliOutput") or ""))
        if not state_root_hash:
            return {
                **result,
                "status": "blocked",
                "hardBlockers": ["casper_state_root_hash_missing"],
            }
        return {**result, "status": "ready", "stateRootHash": state_root_hash}

    @staticmethod
    def query_latest_proof_digest() -> dict[str, Any]:
        if not CasperCliSubmitter.is_client_available():
            return CasperCliSubmitter.with_missing_client_blocker(
                CasperJsonRpcClient.query_latest_proof_digest_sync()
            )
        state = CasperCliSubmitter.get_state_root_hash()
        if state["hardBlockers"]:
            return {**state, "proofDigest": None}
        command = CasperCliCommand.query_latest_digest_command(str(state["stateRootHash"]))
        result = CasperCliSubmitter.run_command(command, "casper_cli_readback")
        if result["hardBlockers"]:
            return {**result, "stateRootHash": state["stateRootHash"], "proofDigest": None}
        proof_digest = CasperCliOutput.extract_cl_value(str(result.get("cliOutput") or ""))
        if not proof_digest:
            return {
                **result,
                "stateRootHash": state["stateRootHash"],
                "proofDigest": None,
                "hardBlockers": ["casper_readback_missing"],
            }
        return {
            **result,
            "status": "ready",
            "stateRootHash": state["stateRootHash"],
            "proofDigest": proof_digest,
        }

    @staticmethod
    def query_decision_receipt(decision_id: str) -> dict[str, Any]:
        if not CasperCliSubmitter.is_client_available():
            return CasperCliSubmitter.with_missing_client_blocker(
                CasperJsonRpcClient.query_decision_receipt_sync(decision_id)
            )
        state = CasperCliSubmitter.get_state_root_hash()
        if state["hardBlockers"]:
            return {**state, "decisionReceipt": None}
        command = CasperCliCommand.query_decision_receipt_command(str(state["stateRootHash"]), decision_id)
        result = CasperCliSubmitter.run_command(command, "casper_cli_receipt_readback")
        if result["hardBlockers"]:
            return {**result, "stateRootHash": state["stateRootHash"], "decisionReceipt": None}
        receipt = CasperCliOutput.extract_cl_value(str(result.get("cliOutput") or ""))
        if not receipt:
            return {
                **result,
                "stateRootHash": state["stateRootHash"],
                "decisionReceipt": None,
                "hardBlockers": ["casper_decision_receipt_readback_missing"],
            }
        return {
            **result,
            "status": "ready",
            "stateRootHash": state["stateRootHash"],
            "decisionReceipt": receipt,
        }

    @staticmethod
    def run_command(command: list[str], failure_prefix: str) -> dict[str, Any]:
        redacted = CasperCliCommand.redacted_command(command)
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                check=False,
                text=True,
                timeout=get_settings().casper_cli_timeout_sec,
            )
        except FileNotFoundError:
            return {"status": "blocked", "hardBlockers": ["casper_client_missing"], "cliCommand": redacted}
        except subprocess.TimeoutExpired:
            return {"status": "blocked", "hardBlockers": [f"{failure_prefix}_timeout"], "cliCommand": redacted}

        output = "\n".join(part for part in (completed.stdout, completed.stderr) if part)
        if completed.returncode != 0:
            return {
                "status": "blocked",
                "hardBlockers": [f"{failure_prefix}_failed"],
                "cliCommand": redacted,
                "cliOutput": output,
            }
        return {"status": "ready", "hardBlockers": [], "cliCommand": redacted, "cliOutput": output}

    @staticmethod
    def with_missing_client_blocker(result: dict[str, Any]) -> dict[str, Any]:
        blockers = list(result.get("hardBlockers") or [])
        if not blockers:
            return result
        if "casper_client_missing" not in blockers:
            blockers.insert(0, "casper_client_missing")
        return {**result, "hardBlockers": blockers}

    @staticmethod
    def failure(blocker: str, command: list[str], output: str | None = None) -> dict[str, Any]:
        return {"submitted": False, "status": "blocked", "hardBlockers": [blocker], "cliCommand": command, "cliOutput": output}
