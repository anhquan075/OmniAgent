import re
from datetime import datetime, timezone

import httpx

from app.core.settings import get_settings
from app.services.shared.ledger import TradeLedger
from app.services.trading.receipt_payload import ReceiptPayloadService

TX_RE = re.compile(r"^0x[a-fA-F0-9]{64}$")
BSC_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
PANCAKE_SWAP_SELECTORS = {"0x38ed1739", "0x7ff36ab5", "0x18cbafe5"}

class ReceiptProofService:
    @staticmethod
    async def get_trade_status(args: dict[str, object]) -> dict[str, object]:
        tx_hash = str(args.get("txHash") or "")
        if not TX_RE.match(tx_hash):
            raise ValueError("A valid BSC transaction hash is required.")
        settings = get_settings()
        receipt = await ReceiptProofService.rpc_call("eth_getTransactionReceipt", [tx_hash])
        transaction = await ReceiptProofService.rpc_call("eth_getTransactionByHash", [tx_hash])
        explorer = settings.bnb_explorer_url.rstrip("/")
        submission_proof = ReceiptProofService.find_submission_proof(tx_hash, str(args.get("tradeIntentId") or ""))
        if receipt is None:
            return {
                "network": "bsc",
                "txHash": tx_hash,
                "status": "pending",
                "explorerUrl": f"{explorer}/tx/{tx_hash}",
                "receipt": None,
                "transaction": transaction,
                "submissionProof": submission_proof,
                "proof": {"valid": False, "reasons": ["receipt_pending"]},
            }
        success = str(receipt.get("status") or "").lower() in {"0x1", "1"}
        proof = ReceiptProofService.validate_trade_proof(
            args,
            receipt,
            transaction if isinstance(transaction, dict) else None,
            success,
            submission_proof,
        )
        result = {
            "network": "bsc",
            "txHash": tx_hash,
            "status": "confirmed" if success else "failed",
            "success": success,
            "blockNumber": int(str(receipt.get("blockNumber") or "0x0"), 16),
            "from": receipt.get("from") or (transaction or {}).get("from"),
            "to": receipt.get("to") or (transaction or {}).get("to"),
            "explorerUrl": f"{explorer}/tx/{tx_hash}",
            "receipt": receipt,
            "transaction": transaction,
            "submissionProof": submission_proof,
            "proof": proof,
        }
        if success and proof["valid"]:
            existing_event = TradeLedger.find_trade_event(tx_hash=tx_hash, event_type="trade_receipt_confirmed")
            payload = ReceiptPayloadService.receipt_payload(result, submission_proof, args)
            result["ledgerEvent"] = existing_event or TradeLedger.append_event({
                "eventType": "trade_receipt_confirmed",
                "tradeIntentId": args.get("tradeIntentId"),
                "txHash": tx_hash,
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "payload": payload,
            })
        return result

    @staticmethod
    def find_submission_proof(tx_hash: str, trade_intent_id: str) -> dict[str, object] | None:
        event = TradeLedger.find_trade_event(
            tx_hash=tx_hash,
            trade_intent_id=trade_intent_id or None,
            event_type="trade_executed",
        )
        if not event:
            return None
        return ReceiptPayloadService.submission_proof(event)

    @staticmethod
    def validate_trade_proof(
        args: dict[str, object],
        receipt: dict[str, object],
        transaction: dict[str, object] | None,
        receipt_success: bool,
        submission_proof: dict[str, object] | None = None,
    ) -> dict[str, object]:
        settings = get_settings()
        expected_from = ReceiptProofService.normalize_address(str((submission_proof or {}).get("walletAddress") or ""))
        expected_to = ReceiptProofService.normalize_address(settings.bnb_pancake_swap_router_address)
        expected_prefix = ReceiptProofService.expected_data_prefix(submission_proof)
        actual_from = ReceiptProofService.normalize_address(str(receipt.get("from") or (transaction or {}).get("from") or ""))
        actual_to = ReceiptProofService.normalize_address(str(receipt.get("to") or (transaction or {}).get("to") or ""))
        actual_input = str((transaction or {}).get("input") or (transaction or {}).get("data") or "").lower()
        selector = actual_input[:10] if actual_input.startswith("0x") else ""
        twak_rest_verified = ReceiptProofService.is_twak_rest_verified(submission_proof, expected_from, actual_from)
        reasons: list[str] = []

        if not submission_proof:
            reasons.append("submission_proof_missing")
        if not receipt_success:
            reasons.append("receipt_failed")
        if expected_from and actual_from != expected_from:
            reasons.append("from_wallet_mismatch")
        if expected_to and actual_to != expected_to and not twak_rest_verified:
            reasons.append("router_mismatch")
        if expected_prefix and not actual_input.startswith(expected_prefix):
            reasons.append("calldata_prefix_mismatch")
        if not expected_prefix and selector and selector not in PANCAKE_SWAP_SELECTORS and not twak_rest_verified:
            reasons.append("unsupported_pancake_selector")
        if not actual_input:
            reasons.append("transaction_input_missing")

        return {
            "valid": not reasons,
            "reasons": reasons,
            "expected": {
                "from": expected_from,
                "to": "twak_rest_executor" if twak_rest_verified else expected_to,
                "dataPrefix": expected_prefix or sorted(PANCAKE_SWAP_SELECTORS),
            },
            "actual": {
                "from": actual_from,
                "to": actual_to,
                "selector": selector or None,
            },
            "bridgeMode": (submission_proof or {}).get("bridgeMode"),
        }

    @staticmethod
    def expected_data_prefix(submission_proof: dict[str, object] | None) -> str:
        quote = (submission_proof or {}).get("quote")
        if not isinstance(quote, dict):
            return ""
        calldata = str(quote.get("calldata") or quote.get("data") or "").lower()
        return calldata[:10] if calldata.startswith("0x") and len(calldata) >= 10 else ""

    @staticmethod
    def normalize_address(value: str) -> str | None:
        if not value:
            return None
        return value.lower() if BSC_ADDRESS_RE.match(value) else value.lower()

    @staticmethod
    def is_twak_rest_verified(
        submission_proof: dict[str, object] | None,
        expected_from: str | None,
        actual_from: str | None,
    ) -> bool:
        if not submission_proof or submission_proof.get("bridgeMode") != "rest":
            return False
        proof_wallet = ReceiptProofService.normalize_address(str(submission_proof.get("walletAddress") or ""))
        cmc_signal = submission_proof.get("cmcAgentHubSignal")
        return bool(
            proof_wallet
            and proof_wallet == expected_from
            and actual_from == expected_from
            and isinstance(cmc_signal, dict)
            and cmc_signal.get("ready")
            and cmc_signal.get("serverVerified")
        )

    @staticmethod
    async def rpc_call(method: str, params: list[object]) -> object:
        settings = get_settings()
        async with httpx.AsyncClient(timeout=12, verify=settings.bnb_rpc_tls_verify) as client:
            response = await client.post(
                settings.bnb_rpc_url,
                json={"jsonrpc": "2.0", "id": method, "method": method, "params": params},
            )
            response.raise_for_status()
            payload = response.json()
        if payload.get("error"):
            raise ValueError(str(payload["error"].get("message") or payload["error"]))
        return payload.get("result")
