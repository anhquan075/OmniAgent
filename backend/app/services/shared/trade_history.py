from datetime import datetime, timezone
from typing import Any
from app.core.settings import get_settings
from app.services.shared.ledger import TradeLedger
from app.services.shared.trade_pnl import TradePnlService

class TradeHistoryService:
    TRADE_EVENT_TYPES = {"trade_executed", "trade_receipt_confirmed", "autonomous_cycle_completed"}

    @staticmethod
    def get_executed_trades(limit: int = 100, offset: int = 0) -> dict[str, object]:
        selected_limit = max(1, min(limit, 500))
        selected_offset = max(0, offset)
        events = TradeLedger._read_events(get_settings().trade_ledger_path)
        trades = TradeHistoryService.records_from_events(events)
        page = trades[selected_offset:selected_offset + selected_limit]
        return {
            "status": "ok",
            "trades": page,
            "count": len(page),
            "total": len(trades),
            "recordCounts": {
                "trade": sum(1 for record in trades if record.get("recordType") == "trade"),
                "cycle": sum(1 for record in trades if record.get("recordType") == "cycle"),
            },
            "limit": selected_limit,
            "offset": selected_offset,
            "hasMore": selected_offset + selected_limit < len(trades),
        }

    @staticmethod
    def records_from_events(events: list[dict[str, Any]]) -> list[dict[str, object]]:
        records: dict[str, dict[str, object]] = {}
        intent_keys: dict[str, str] = {}
        for event in events:
            event_type = str(event.get("eventType") or "")
            if event_type not in TradeHistoryService.TRADE_EVENT_TYPES:
                continue
            payload = TradeHistoryService.payload(event)
            tx_hash = TradeHistoryService.tx_hash(event, payload)
            intent_id = str(event.get("tradeIntentId") or "")
            existing_key = intent_keys.get(intent_id) if intent_id else None
            if event_type == "autonomous_cycle_completed" and not tx_hash:
                key = existing_key or f"cycle:{intent_id or event.get('createdAt') or len(records)}"
            else:
                key = existing_key or tx_hash or str(
                    event.get("tradeIntentId") or event.get("createdAt") or len(records)
                )
            if intent_id:
                intent_keys[intent_id] = key
            base = TradeHistoryService.base_record(event, payload, tx_hash, event_type)
            record = records.setdefault(key, base)
            TradeHistoryService.merge_event(record, event, payload, event_type, tx_hash)
        return sorted(records.values(), key=TradeHistoryService.sort_key, reverse=True)

    @staticmethod
    def base_record(
        event: dict[str, Any],
        payload: dict[str, Any],
        tx_hash: str | None,
        event_type: str,
    ) -> dict[str, object]:
        created_at = str(event.get("createdAt") or datetime.now(timezone.utc).isoformat())
        is_trade = bool(tx_hash) or event_type in {"trade_executed", "trade_receipt_confirmed"}
        return {
            "recordType": "trade" if is_trade else "cycle",
            "executionKind": "onchain_trade" if is_trade else "guarded_cycle",
            "tradeIntentId": event.get("tradeIntentId"),
            "txHash": tx_hash,
            "status": "submitted" if is_trade else str(payload.get("status") or "guarded"),
            "eventType": event.get("eventType"),
            "symbol": payload.get("symbol"),
            "side": payload.get("side"),
            "amountUsd": payload.get("amountUsd"),
            "createdAt": created_at,
            "executedAt": created_at if is_trade else None,
            "confirmedAt": None,
            "updatedAt": created_at,
            "walletAddress": payload.get("walletAddress"),
            "bridgeMode": payload.get("bridgeMode"),
            "explorerUrl": TradeHistoryService.explorer_url(payload, tx_hash),
            **dict.fromkeys((
                "cmcTool", "receiptProofValid", "basisUsd", "pnlUsd", "pnlPct", "pnlSource",
                "blockNumber", "from", "to",
            ), None),
            "cmcServerVerified": False,
            "sources": [],
        }

    @staticmethod
    def merge_event(
        record: dict[str, object],
        event: dict[str, Any],
        payload: dict[str, Any],
        event_type: str,
        tx_hash: str | None,
    ) -> None:
        created_at = str(event.get("createdAt") or record.get("updatedAt") or "")
        execution = payload.get("execution") if isinstance(payload.get("execution"), dict) else {}
        ledger_event = execution.get("ledgerEvent") if isinstance(execution.get("ledgerEvent"), dict) else {}
        ledger_payload = TradeHistoryService.payload(ledger_event)
        submission = payload.get("submissionProof") if isinstance(payload.get("submissionProof"), dict) else {}
        for key, value in {
            "tradeIntentId": event.get("tradeIntentId"),
            "txHash": tx_hash,
            "symbol": payload.get("symbol") or submission.get("symbol"),
            "side": payload.get("side") or submission.get("side"),
            "amountUsd": payload.get("amountUsd") or submission.get("amountUsd"),
            "walletAddress": (
                payload.get("walletAddress") or ledger_payload.get("walletAddress")
                or submission.get("walletAddress")
            ),
            "bridgeMode": payload.get("bridgeMode") or ledger_payload.get("bridgeMode") or submission.get("bridgeMode"),
            "explorerUrl": TradeHistoryService.explorer_url(payload, tx_hash),
        }.items():
            TradeHistoryService.prefer(record, key, value)
        pnl_fields = TradePnlService.pnl_fields_from_payloads(
            TradeHistoryService.pnl_payloads(payload, ledger_payload, execution, submission),
            record.get("amountUsd"),
        )
        if pnl_fields.get("pnlUsd") is not None:
            record["basisUsd"] = pnl_fields.get("basisUsd")
            record["pnlUsd"] = pnl_fields.get("pnlUsd")
            record["pnlPct"] = pnl_fields.get("pnlPct")
            record["pnlSource"] = "trade_history"
        cmc_signal = TradeHistoryService.cmc_signal(payload, execution, ledger_payload)
        if cmc_signal:
            TradeHistoryService.prefer(record, "cmcTool", cmc_signal.get("toolName"))
            record["cmcServerVerified"] = bool(cmc_signal.get("serverVerified"))
        if event_type == "trade_receipt_confirmed":
            record["recordType"] = "trade"
            record["executionKind"] = "onchain_trade"
            proof = payload.get("proof") if isinstance(payload.get("proof"), dict) else {}
            record.update({
                "status": "confirmed",
                "confirmedAt": created_at,
                "receiptProofValid": bool(proof.get("valid")),
                "blockNumber": payload.get("blockNumber"),
                "from": payload.get("from"),
                "to": payload.get("to"),
            })
        elif event_type == "trade_executed":
            record["recordType"] = "trade"
            record["executionKind"] = "onchain_trade"
            record["status"] = "submitted" if record.get("status") != "confirmed" else record["status"]
            record["executedAt"] = created_at
        elif event_type == "autonomous_cycle_completed":
            status = execution.get("status") or payload.get("status")
            if status and record.get("status") != "confirmed":
                record["status"] = str(status)
        record["updatedAt"] = created_at
        sources = record.get("sources")
        if isinstance(sources, list):
            sources.append({"eventType": event_type, "createdAt": created_at})

    @staticmethod
    def payload(event: dict[str, Any]) -> dict[str, Any]:
        payload = event.get("payload")
        return payload if isinstance(payload, dict) else {}

    @staticmethod
    def tx_hash(event: dict[str, Any], payload: dict[str, Any]) -> str | None:
        execution = payload.get("execution") if isinstance(payload.get("execution"), dict) else {}
        ledger_event = execution.get("ledgerEvent") if isinstance(execution.get("ledgerEvent"), dict) else {}
        value = event.get("txHash") or payload.get("txHash") or execution.get("txHash") or ledger_event.get("txHash")
        return str(value) if value else None

    @staticmethod
    def explorer_url(payload: dict[str, Any], tx_hash: str | None) -> str | None:
        execution = payload.get("execution") if isinstance(payload.get("execution"), dict) else {}
        value = payload.get("explorerUrl") or execution.get("explorerUrl")
        if value:
            return str(value)
        return f"{get_settings().bnb_explorer_url.rstrip('/')}/tx/{tx_hash}" if tx_hash else None

    @staticmethod
    def cmc_signal(*payloads: dict[str, Any]) -> dict[str, Any] | None:
        for payload in payloads:
            value = payload.get("cmcAgentHubSignal")
            if isinstance(value, dict):
                return value
        return None

    @staticmethod
    def pnl_payloads(*payloads: dict[str, Any]) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for payload in payloads:
            if isinstance(payload, dict):
                result.extend(TradePnlService.pnl_payloads(payload))
        return result

    @staticmethod
    def prefer(record: dict[str, object], key: str, value: object) -> None:
        if value not in (None, "") and record.get(key) in (None, "", "unknown"):
            record[key] = value

    @staticmethod
    def sort_key(record: dict[str, object]) -> str:
        return str(record.get("confirmedAt") or record.get("executedAt") or record.get("createdAt") or "")
