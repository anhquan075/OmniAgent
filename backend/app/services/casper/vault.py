"""Collateral vault submission helpers for OmniAgent."""

from __future__ import annotations

from typing import Any

from app.core.settings import get_settings
from app.services.casper.account import CasperAccountService
from app.services.casper.cli_command import CasperCliCommand
from app.services.casper.cli_output import CasperCliOutput
from app.services.casper.submitter import CasperCliSubmitter


# Policy action → vault entry point
ACTION_TO_VAULT_EP = {
    "block": "freeze",
    "approve": "unfreeze",
    "haircut": "set_ltv",
}


class CasperVaultService:
    @staticmethod
    def map_action(action: str) -> str | None:
        return ACTION_TO_VAULT_EP.get(str(action or "").strip().lower())

    @staticmethod
    def is_configured() -> bool:
        settings = get_settings()
        return bool(
            settings.casper_vault_enforce_enabled
            and (settings.casper_vault_contract_hash or settings.casper_vault_package_hash)
        )

    @staticmethod
    def session_target_args() -> list[str]:
        settings = get_settings()
        if settings.casper_vault_contract_hash:
            return ["--session-hash", settings.casper_vault_contract_hash]
        return ["--session-package-hash", str(settings.casper_vault_package_hash)]

    @staticmethod
    def build_vault_command(
        *,
        entry_point: str,
        asset_id: str,
        decision_id: str = "",
        receipt: str = "",
        amount: int | None = None,
        ltv_bps: int | None = None,
    ) -> list[str]:
        settings = get_settings()
        secret_path = CasperAccountService.secret_key_path()
        if secret_path is None:
            raise RuntimeError("Casper vault command requested before secret key available.")
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
            *CasperVaultService.session_target_args(),
            "--session-entry-point",
            entry_point,
            "--session-arg",
            f"asset_id:string='{asset_id.replace(chr(39), '')}'",
        ]
        if entry_point == "deposit":
            command.extend(["--session-arg", f"amount:u64='{int(amount or 0)}'"])
            return command
        command.extend(
            [
                "--session-arg",
                f"decision_id:string='{decision_id.replace(chr(39), '')}'",
                "--session-arg",
                f"receipt:string='{receipt.replace(chr(39), '')}'",
            ]
        )
        if entry_point == "set_ltv":
            command.extend(["--session-arg", f"ltv_bps:u64='{int(ltv_bps or 5000)}'"])
        return command

    @staticmethod
    def submit_entry(
        *,
        entry_point: str,
        asset_id: str,
        decision_id: str = "",
        receipt: str = "",
        amount: int | None = None,
        ltv_bps: int | None = None,
    ) -> dict[str, Any]:
        if not CasperCliSubmitter.is_client_available():
            return {
                "submitted": False,
                "status": "blocked",
                "hardBlockers": ["casper_client_missing"],
            }
        if not (
            get_settings().casper_vault_contract_hash or get_settings().casper_vault_package_hash
        ):
            return {
                "submitted": False,
                "status": "blocked",
                "hardBlockers": ["casper_vault_contract_missing"],
            }
        if not CasperCliSubmitter._submit_lock.acquire(blocking=False):
            return CasperCliSubmitter.failure("casper_submit_in_progress", [])
        try:
            command = CasperVaultService.build_vault_command(
                entry_point=entry_point,
                asset_id=asset_id,
                decision_id=decision_id,
                receipt=receipt,
                amount=amount,
                ltv_bps=ltv_bps,
            )
            result = CasperCliSubmitter.run_command(command, "casper_cli_vault_submit")
            if result["hardBlockers"]:
                return CasperCliSubmitter.failure(
                    result["hardBlockers"][0],
                    result["cliCommand"],
                    result.get("cliOutput"),
                    outcome_unknown=bool(result.get("outcomeUnknown")),
                )
            transaction_hash = CasperCliOutput.extract_hash(str(result.get("cliOutput") or ""))
            if not transaction_hash:
                return CasperCliSubmitter.failure(
                    "casper_cli_transaction_hash_missing",
                    result["cliCommand"],
                    str(result.get("cliOutput") or ""),
                    outcome_unknown=True,
                )
            explorer = get_settings().casper_explorer_url.rstrip("/")
            return {
                "submitted": True,
                "status": "submitted",
                "entryPoint": entry_point,
                "assetId": asset_id,
                "decisionId": decision_id,
                "transactionHash": transaction_hash,
                "deployHash": transaction_hash,
                "explorerUrl": f"{explorer}/deploy/{transaction_hash}",
                "hardBlockers": [],
                "cliCommand": result["cliCommand"],
            }
        finally:
            CasperCliSubmitter._submit_lock.release()

    @staticmethod
    def enforce_from_decision(decision: dict[str, Any]) -> dict[str, Any] | None:
        """If vault enforcement is armed, map decision action → vault call."""
        settings = get_settings()
        if not CasperVaultService.is_configured():
            return None
        action = str(decision.get("action") or "")
        entry_point = CasperVaultService.map_action(action)
        if entry_point is None:
            return {
                "submitted": False,
                "status": "skipped",
                "reason": "action_has_no_vault_mapping",
                "action": action,
            }
        decision_id = str(decision.get("decisionId") or "")
        receipt_obj = decision.get("decisionReceipt")
        if isinstance(receipt_obj, dict):
            receipt = str(receipt_obj.get("receiptValue") or "")
        else:
            receipt = str(receipt_obj or "")
        if not decision_id or not receipt:
            return {
                "submitted": False,
                "status": "blocked",
                "hardBlockers": ["casper_vault_receipt_missing"],
            }
        # Haircut → reduce LTV (default 5000 bps = 50%).
        ltv_bps = 5000 if entry_point == "set_ltv" else None
        return CasperVaultService.submit_entry(
            entry_point=entry_point,
            asset_id=settings.casper_vault_asset_id,
            decision_id=decision_id,
            receipt=receipt,
            ltv_bps=ltv_bps,
        )
