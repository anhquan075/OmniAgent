import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.logging import get_logger
from app.core.settings import get_settings
from app.services.shared.ledger_pnl import LedgerPnl

logger = get_logger(__name__)

class TradeLedger:
    @staticmethod
    def _read_events(path: Path) -> list[dict[str, Any]]:
        if not path.exists():
            return []
        events: list[dict[str, Any]] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(event, dict):
                events.append(event)
        return events

    @staticmethod
    def get_ledger_summary(limit: int = 10) -> dict[str, object]:
        settings = get_settings()
        events = TradeLedger._read_events(settings.trade_ledger_path)
        tx_events = [event for event in events if event.get("txHash")]
        submitted_trade_events = [
            event for event in events
            if event.get("eventType") in {"trade_executed", "trade_receipt_confirmed"}
        ]
        confirmed_trade_events = TradeLedger.unique_trade_events([
            event for event in events
            if event.get("eventType") == "trade_receipt_confirmed"
        ])
        today_submitted_trade_events = [event for event in submitted_trade_events if TradeLedger.is_today(event.get("createdAt"))]
        today_confirmed_trade_events = [
            event for event in confirmed_trade_events
            if TradeLedger.is_today(event.get("createdAt"))
        ]
        pause_event = next(
            (
                event for event in reversed(events)
                if event.get("eventType") == "trade_blocked"
                and event.get("action") == "emergency_pause"
            ),
            None,
        )
        paused = bool(((pause_event or {}).get("payload") or {}).get("emergencyPaused"))
        pnl = TradeLedger.latest_pnl(events)
        return {
            "events": list(reversed(events[-limit:])),
            "txEvents": list(reversed(tx_events[-limit:])),
            "control": {"emergencyPaused": paused},
            "dailyCompliance": {
                "tradeCount": len(confirmed_trade_events),
                "submittedTradeCount": len(submitted_trade_events),
                "todayTradeCount": len(today_submitted_trade_events),
                "todayConfirmedTradeCount": len(today_confirmed_trade_events),
                "progress": f"{len(confirmed_trade_events)}/7",
                "submittedProgress": f"{len(submitted_trade_events)}/7",
                "minimumTrades": 7,
            },
            "pnl": pnl,
            "ledgerPath": str(settings.trade_ledger_path),
        }

    @staticmethod
    def unique_trade_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[str] = set()
        unique: list[dict[str, Any]] = []
        for event in events:
            payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
            key = str(
                event.get("txHash")
                or payload.get("proofDigest")
                or event.get("tradeIntentId")
                or event.get("createdAt")
                or len(unique)
            )
            if key in seen:
                continue
            seen.add(key)
            unique.append(event)
        return unique

    @staticmethod
    def find_trade_event(
        *,
        tx_hash: str | None = None,
        trade_intent_id: str | None = None,
        event_type: str | None = None,
    ) -> dict[str, Any] | None:
        events = TradeLedger._read_events(get_settings().trade_ledger_path)
        for event in reversed(events):
            if event_type and event.get("eventType") != event_type:
                continue
            if tx_hash and event.get("txHash") == tx_hash:
                return event
            if trade_intent_id and event.get("tradeIntentId") == trade_intent_id:
                return event
        return None

    @staticmethod
    def latest_trade_event(event_type: str | None = None) -> dict[str, Any] | None:
        events = TradeLedger._read_events(get_settings().trade_ledger_path)
        for event in reversed(events):
            if event_type is None or event.get("eventType") == event_type:
                return event
        return None

    @staticmethod
    def append_event(event: dict[str, Any]) -> dict[str, Any]:
        settings = get_settings()
        settings.trade_ledger_path.parent.mkdir(parents=True, exist_ok=True)
        with settings.trade_ledger_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(event, separators=(",", ":")) + "\n")
        TradeLedger.log_event(event)
        return event

    @staticmethod
    def log_event(event: dict[str, Any]) -> None:
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        cmc_signal = payload.get("cmcAgentHubSignal") if isinstance(payload.get("cmcAgentHubSignal"), dict) else {}
        if not cmc_signal and isinstance(payload.get("submissionProof"), dict):
            proof = payload["submissionProof"]
            cmc_signal = proof.get("cmcAgentHubSignal") if isinstance(proof.get("cmcAgentHubSignal"), dict) else {}
        logger.info(
            "ledger_event_recorded",
            eventType=event.get("eventType"),
            tradeIntentId=event.get("tradeIntentId"),
            txHash=event.get("txHash"),
            status=payload.get("status") or payload.get("reason"),
            cmcTool=cmc_signal.get("toolName"),
            cmcVerified=cmc_signal.get("serverVerified"),
        )

    @staticmethod
    def is_today(value: object) -> bool:
        timestamp = LedgerPnl.parse_timestamp(value)
        if timestamp is None:
            return False
        return timestamp.date() == datetime.now(timezone.utc).date()

    @staticmethod
    def latest_pnl(events: list[dict[str, Any]]) -> dict[str, object]:
        return LedgerPnl.latest(events)
