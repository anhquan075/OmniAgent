from datetime import datetime, timezone

from app.core.settings import get_settings
from app.services.shared.ledger import TradeLedger

MAX_TEXT = 320
MAX_LIST_ITEMS = 3
MAX_DICT_ITEMS = 8

class CmcSignalEvidenceService:
    @staticmethod
    def submitted_trade_result(
        args: dict[str, object],
        simulation: dict[str, object],
        tx_hash: object,
        bridge_mode: str,
    ) -> dict[str, object]:
        explorer_url = f"{get_settings().bnb_explorer_url.rstrip('/')}/tx/{tx_hash}"
        cmc_evidence = CmcSignalEvidenceService.cmc_signal_evidence(args)
        event = TradeLedger.append_event({
            "eventType": "trade_executed",
            "tradeIntentId": args.get("tradeIntentId"),
            "txHash": tx_hash,
            "payload": {
                "bridgeMode": bridge_mode,
                "walletAddress": simulation["walletAddress"],
                "explorerUrl": explorer_url,
                "cmcAgentHubSignal": cmc_evidence,
                **CmcSignalEvidenceService.trade_context(args, simulation),
            },
            "createdAt": datetime.now(timezone.utc).isoformat(),
        })
        return {
            "network": "bsc",
            "status": "submitted",
            "txHash": tx_hash,
            "explorerUrl": explorer_url,
            "cmcAgentHubSignal": cmc_evidence,
            "ledgerEvent": event,
        }

    @staticmethod
    def trade_context(args: dict[str, object], simulation: dict[str, object]) -> dict[str, object]:
        quote = simulation.get("quote") if isinstance(simulation.get("quote"), dict) else {}
        return {
            "symbol": args.get("symbol"),
            "side": args.get("side"),
            "amountUsd": args.get("amountUsd") or quote.get("amountUsd"),
            "slippageBps": args.get("slippageBps") or quote.get("slippageBps"),
            "quote": CmcSignalEvidenceService.quote_evidence(quote),
        }

    @staticmethod
    def quote_evidence(quote: dict[str, object]) -> dict[str, object]:
        keys = (
            "quoteSource",
            "inputSymbol",
            "outputSymbol",
            "amountInRaw",
            "expectedOutputRaw",
            "minOutputRaw",
            "slippageBps",
        )
        return {key: quote[key] for key in keys if key in quote}

    @staticmethod
    def cmc_signal_evidence(args: dict[str, object]) -> dict[str, object] | None:
        signal = args.get("cmcAgentHubSignal")
        if not isinstance(signal, dict):
            return None
        return {
            "source": signal.get("source"),
            "toolName": signal.get("toolName"),
            "ready": bool(signal.get("ready")),
            "serverVerified": bool(signal.get("serverVerified")),
            "reachable": bool(signal.get("reachable")),
            "resolution": signal.get("resolution"),
            "parsedContent": CmcSignalEvidenceService.compact_json(signal.get("parsedContent")),
            "timestamp": signal.get("timestamp"),
            "reason": signal.get("reason"),
        }

    @staticmethod
    def compact_json(value: object) -> object:
        if isinstance(value, str):
            return value if len(value) <= MAX_TEXT else f"{value[:MAX_TEXT]}..."
        if isinstance(value, list):
            return [CmcSignalEvidenceService.compact_json(item) for item in value[:MAX_LIST_ITEMS]]
        if isinstance(value, dict):
            items = list(value.items())[:MAX_DICT_ITEMS]
            return {str(key): CmcSignalEvidenceService.compact_json(item) for key, item in items}
        return value
