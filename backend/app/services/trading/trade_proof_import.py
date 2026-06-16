from datetime import datetime, timezone

from app.services.shared.ledger import TradeLedger
from app.services.trading.receipt import ReceiptProofService
from app.services.trading.receipt_payload import ReceiptPayloadService
from app.services.wallet.agent_wallet import AgentWalletService


class TradeProofImportService:
    @staticmethod
    async def import_trade_proof(args: dict[str, object]) -> dict[str, object]:
        tx_hash = ReceiptProofService.require_tx_hash(args.get("txHash"))
        existing = TradeLedger.find_trade_event(tx_hash=tx_hash, event_type="trade_executed")
        if existing:
            receipt = await ReceiptProofService.get_trade_status({
                **args,
                "txHash": tx_hash,
                "tradeIntentId": existing.get("tradeIntentId") or args.get("tradeIntentId"),
            })
            return {
                "network": "bsc",
                "status": "already_recorded",
                "imported": False,
                "tradeExecutionEvent": existing,
                "latestReceiptStatus": receipt,
                "proof": receipt.get("proof"),
            }

        wallet = AgentWalletService.get_wallet_data()
        wallet_address = str(wallet.get("walletAddress") or "")
        if not wallet_address:
            raise ValueError("Agent wallet is not configured; cannot import a trade proof.")

        trade_intent_id = str(args.get("tradeIntentId") or f"import-{tx_hash[2:10]}")
        submission_proof = TradeProofImportService.submission_proof(
            args,
            tx_hash,
            trade_intent_id,
            wallet_address,
        )
        receipt = await ReceiptProofService.receipt_status(
            args,
            tx_hash,
            submission_proof,
            record_valid_receipt=False,
        )
        proof = receipt.get("proof") if isinstance(receipt.get("proof"), dict) else {}
        if receipt.get("status") != "confirmed" or proof.get("valid") is not True:
            return {
                "network": "bsc",
                "status": "rejected",
                "imported": False,
                "reason": ", ".join(str(item) for item in proof.get("reasons") or []) or str(receipt.get("status")),
                "latestReceiptStatus": receipt,
                "proof": proof,
            }

        event = TradeLedger.append_event({
            "eventType": "trade_executed",
            "tradeIntentId": trade_intent_id,
            "txHash": tx_hash,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "payload": TradeProofImportService.submission_payload(args, wallet_address),
        })
        confirmed = await ReceiptProofService.get_trade_status({
            **args,
            "txHash": tx_hash,
            "tradeIntentId": trade_intent_id,
        })
        return {
            "network": "bsc",
            "status": "imported",
            "imported": True,
            "tradeExecutionEvent": event,
            "latestReceiptStatus": confirmed,
            "proof": confirmed.get("proof"),
        }

    @staticmethod
    def submission_proof(
        args: dict[str, object],
        tx_hash: str,
        trade_intent_id: str,
        wallet_address: str,
    ) -> dict[str, object]:
        proof: dict[str, object] = {
            "tradeIntentId": trade_intent_id,
            "txHash": tx_hash,
            "bridgeMode": str(args.get("bridgeMode") or "operator-import"),
            "walletAddress": wallet_address,
        }
        for key in ReceiptPayloadService.TRADE_KEYS:
            if args.get(key) is not None:
                proof[key] = args[key]
        return proof

    @staticmethod
    def submission_payload(args: dict[str, object], wallet_address: str) -> dict[str, object]:
        payload: dict[str, object] = {
            "source": "operator_import",
            "status": "imported",
            "bridgeMode": str(args.get("bridgeMode") or "operator-import"),
            "walletAddress": wallet_address,
            "importedAt": datetime.now(timezone.utc).isoformat(),
        }
        for key in ReceiptPayloadService.TRADE_KEYS:
            if args.get(key) is not None:
                payload[key] = args[key]
        return payload
