from datetime import datetime, timezone
from typing import Any

class TradePnlService:
    TRADE_EVENT_TYPES = {"trade_executed", "trade_receipt_confirmed", "autonomous_cycle_completed"}

    @staticmethod
    def summary(
        events: list[dict[str, Any]],
        start_at: datetime | None = None,
        source: str = "trade_history",
    ) -> dict[str, object]:
        records = [
            record for record in TradePnlService.records_from_events(events)
            if record["confirmed"] and TradePnlService.in_period(record, start_at)
        ]
        tracked = [
            record for record in records
            if record.get("pnlUsd") is not None and float(record.get("basisUsd") or 0) > 0
        ]
        missing = len(records) - len(tracked)
        total_pnl = sum(float(record.get("pnlUsd") or 0) for record in tracked)
        notional = sum(float(record.get("basisUsd") or 0) for record in tracked)
        latest_at = max(
            (record.get("timestamp") for record in tracked if isinstance(record.get("timestamp"), datetime)),
            default=None,
        )
        return {
            "source": source if tracked else "trade_history_missing_pnl",
            "available": bool(tracked),
            "status": TradePnlService.status(len(records), len(tracked), missing),
            "confirmedTrades": len(records),
            "trackedTrades": len(tracked),
            "missingPnlTrades": missing,
            "totalPnlUsd": round(total_pnl, 8),
            "notionalUsd": round(notional, 8),
            "totalReturnPct": TradePnlService.return_pct(total_pnl, notional),
            "maxDrawdownPct": TradePnlService.max_drawdown_pct(tracked, notional),
            "latestPnlAt": latest_at.isoformat() if latest_at else None,
        }

    @staticmethod
    def records_from_events(events: list[dict[str, Any]]) -> list[dict[str, object]]:
        records: dict[str, dict[str, object]] = {}
        for event in events:
            event_type = str(event.get("eventType") or "")
            if event_type not in TradePnlService.TRADE_EVENT_TYPES:
                continue
            payload = TradePnlService.payload(event)
            tx_hash = TradePnlService.tx_hash(event, payload)
            if event_type == "autonomous_cycle_completed" and not tx_hash:
                continue
            key = tx_hash or str(event.get("tradeIntentId") or event.get("createdAt") or len(records))
            record = records.setdefault(key, TradePnlService.base_record())
            TradePnlService.merge_event(record, event, payload, event_type, tx_hash)
        return sorted(records.values(), key=lambda item: str(item.get("sortAt") or ""))

    @staticmethod
    def base_record() -> dict[str, object]:
        return {
            "confirmed": False,
            "timestamp": None,
            "sortAt": "",
            "amountUsd": None,
            "basisUsd": None,
            "pnlUsd": None,
            "pnlPct": None,
        }

    @staticmethod
    def merge_event(
        record: dict[str, object],
        event: dict[str, Any],
        payload: dict[str, Any],
        event_type: str,
        tx_hash: str | None,
    ) -> None:
        timestamp = TradePnlService.parse_timestamp(event.get("createdAt"))
        if event_type == "trade_receipt_confirmed":
            record["confirmed"] = True
            record["timestamp"] = timestamp
        if timestamp is not None:
            record["sortAt"] = timestamp.isoformat()
        payloads = TradePnlService.pnl_payloads(payload)
        amount = TradePnlService.first_float(payloads, ("amountUsd",))
        if amount is not None and record.get("amountUsd") is None:
            record["amountUsd"] = amount
        fields = TradePnlService.pnl_fields_from_payloads(payloads, record.get("amountUsd"))
        for key, value in fields.items():
            if value is not None:
                record[key] = value
        if tx_hash:
            record["txHash"] = tx_hash

    @staticmethod
    def pnl_fields_from_payloads(
        payloads: list[dict[str, Any]],
        fallback_basis: object = None,
    ) -> dict[str, float | None]:
        basis = TradePnlService.first_float(payloads, ("basisUsd", "notionalUsd", "entryValueUsd", "costBasisUsd"))
        if basis is None:
            basis = TradePnlService.first_float(payloads, ("amountUsd",))
        if basis is None:
            basis = TradePnlService.as_float(fallback_basis)
        pnl_usd = TradePnlService.first_float(payloads, ("realizedPnlUsd", "pnlUsd", "profitUsd"))
        if pnl_usd is None:
            loss = TradePnlService.first_float(payloads, ("lossUsd",))
            pnl_usd = -abs(loss) if loss is not None else None
        pnl_pct = TradePnlService.first_float(
            payloads,
            ("realizedPnlPct", "pnlPct", "returnPct"),
        )
        if pnl_usd is None and pnl_pct is not None and basis:
            pnl_usd = basis * pnl_pct / 100
        if pnl_pct is None and pnl_usd is not None and basis:
            pnl_pct = pnl_usd / basis * 100
        return {"basisUsd": basis, "pnlUsd": pnl_usd, "pnlPct": pnl_pct}

    @staticmethod
    def pnl_payloads(payload: dict[str, Any]) -> list[dict[str, Any]]:
        payloads = [payload]
        for key in ("pnl", "tradePnl", "pnlSummary", "submissionProof", "execution"):
            value = payload.get(key)
            if isinstance(value, dict):
                payloads.append(value)
                nested = value.get("pnl") if isinstance(value.get("pnl"), dict) else None
                if nested:
                    payloads.append(nested)
        return payloads

    @staticmethod
    def first_float(payloads: list[dict[str, Any]], keys: tuple[str, ...]) -> float | None:
        for payload in payloads:
            for key in keys:
                value = TradePnlService.as_float(payload.get(key))
                if value is not None:
                    return value
        return None

    @staticmethod
    def as_float(value: object) -> float | None:
        try:
            number = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
        return number if number == number else None

    @staticmethod
    def return_pct(total_pnl: float, notional: float) -> float:
        return round((total_pnl / notional) * 100, 8) if notional > 0 else 0.0

    @staticmethod
    def max_drawdown_pct(records: list[dict[str, object]], notional: float) -> float:
        if not records or notional <= 0:
            return 0.0
        peak = 0.0
        cumulative = 0.0
        max_drawdown = 0.0
        for record in records:
            cumulative += float(record.get("pnlUsd") or 0)
            peak = max(peak, cumulative)
            max_drawdown = max(max_drawdown, peak - cumulative)
        return round((max_drawdown / notional) * 100, 8)

    @staticmethod
    def in_period(record: dict[str, object], start_at: datetime | None) -> bool:
        timestamp = record.get("timestamp")
        return start_at is None or not isinstance(timestamp, datetime) or timestamp >= start_at

    @staticmethod
    def status(confirmed: int, tracked: int, missing: int) -> str:
        if confirmed == 0:
            return "no_confirmed_trades"
        if tracked == 0:
            return "missing_trade_pnl"
        return "partial" if missing else "ok"

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
    def parse_timestamp(value: object) -> datetime | None:
        if not isinstance(value, str) or not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
        except ValueError:
            return None
