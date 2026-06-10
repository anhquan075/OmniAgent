class ReceiptPayloadService:
    TRADE_KEYS = ("symbol", "side", "amountUsd", "slippageBps", "quote")
    PNL_KEYS = ("realizedPnlUsd", "pnlUsd", "basisUsd", "notionalUsd", "pnlPct", "realizedPnlPct")

    @staticmethod
    def submission_proof(event: dict[str, object]) -> dict[str, object]:
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        cmc_signal = payload.get("cmcAgentHubSignal") if isinstance(payload, dict) else None
        proof = {
            "tradeIntentId": event.get("tradeIntentId"),
            "txHash": event.get("txHash"),
            "bridgeMode": payload.get("bridgeMode"),
            "walletAddress": payload.get("walletAddress"),
            "cmcAgentHubSignal": cmc_signal if isinstance(cmc_signal, dict) else None,
        }
        for key in ReceiptPayloadService.TRADE_KEYS:
            if payload.get(key) is not None:
                proof[key] = payload[key]
        pnl = ReceiptPayloadService.pnl_payload(payload)
        if pnl:
            proof["pnl"] = pnl
        return proof

    @staticmethod
    def receipt_payload(
        result: dict[str, object],
        submission_proof: dict[str, object] | None,
        args: dict[str, object],
    ) -> dict[str, object]:
        payload = {
            "blockNumber": result["blockNumber"],
            "from": result["from"],
            "to": result["to"],
            "explorerUrl": result["explorerUrl"],
            "submissionProof": submission_proof,
            "proof": result["proof"],
        }
        for key in ReceiptPayloadService.TRADE_KEYS:
            value = args.get(key) or (submission_proof or {}).get(key)
            if value is not None:
                payload[key] = value
        pnl = ReceiptPayloadService.pnl_payload(args) or (submission_proof or {}).get("pnl")
        if isinstance(pnl, dict) and pnl:
            payload["pnl"] = pnl
        return payload

    @staticmethod
    def pnl_payload(source: dict[str, object]) -> dict[str, object]:
        return {key: source[key] for key in ReceiptPayloadService.PNL_KEYS if source.get(key) is not None}
