from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
from typing import Any

from app.core.settings import get_settings


class CasperDecisionLedger:
    @staticmethod
    def get_ledger_summary(limit: int = 10, offset: int = 0) -> dict[str, Any]:
        events = CasperDecisionLedger._read_events()
        selected_limit = max(1, limit)
        selected_offset = max(0, offset)
        selected = list(reversed(events))[selected_offset:selected_offset + selected_limit]
        return {
            "network": "casper",
            "eventCount": len(events),
            "limit": selected_limit,
            "offset": selected_offset,
            "events": selected,
        }

    @staticmethod
    def append_event(event: dict[str, Any]) -> dict[str, Any]:
        normalized = CasperDecisionLedger._normalize_event(event)
        with CasperDecisionLedger._connect() as db:
            CasperDecisionLedger._ensure_schema(db)
            cursor = db.execute(
                "INSERT INTO events (created_at, event_json) VALUES (?, ?)",
                (normalized["createdAt"], json.dumps(normalized, sort_keys=True, default=str)),
            )
            CasperDecisionLedger._rotate_if_needed(db)
        return {**normalized, "eventId": int(cursor.lastrowid)}

    @staticmethod
    def replace_events(events: list[dict[str, Any]]) -> None:
        selected = events[-get_settings().casper_ledger_max_events:]
        with CasperDecisionLedger._connect() as db:
            CasperDecisionLedger._ensure_schema(db)
            db.execute("DELETE FROM events")
            normalized = [
                CasperDecisionLedger._normalize_event(event)
                for event in selected
                if isinstance(event, dict)
            ]
            db.executemany(
                "INSERT INTO events (created_at, event_json) VALUES (?, ?)",
                [(event["createdAt"], json.dumps(event, sort_keys=True, default=str)) for event in normalized],
            )

    @staticmethod
    def clear_current_log() -> None:
        with CasperDecisionLedger._connect() as db:
            CasperDecisionLedger._ensure_schema(db)
            db.execute("DELETE FROM events")

    @staticmethod
    def _read_events() -> list[dict[str, Any]]:
        max_events = get_settings().casper_ledger_max_events
        with CasperDecisionLedger._connect() as db:
            CasperDecisionLedger._ensure_schema(db)
            rows = db.execute(
                """
                SELECT id, event_json FROM events
                ORDER BY id DESC
                LIMIT ?
                """,
                (max_events,),
            ).fetchall()
        events: list[dict[str, Any]] = []
        for row in reversed(rows):
            try:
                event = json.loads(row[1])
            except (TypeError, ValueError):
                continue
            if isinstance(event, dict):
                events.append({**event, "eventId": int(row[0])})
        return events

    @staticmethod
    def _rotate_if_needed(db: sqlite3.Connection) -> None:
        max_events = get_settings().casper_ledger_max_events
        db.execute(
            """
            DELETE FROM events
            WHERE id NOT IN (
                SELECT id FROM events ORDER BY id DESC LIMIT ?
            )
            """,
            (max_events,),
        )

    @staticmethod
    def _normalize_event(event: dict[str, Any]) -> dict[str, Any]:
        return {
            "network": "casper",
            "eventType": str(event.get("eventType") or "casper_decision_event"),
            "action": str(event.get("action") or "observe"),
            "createdAt": str(event.get("createdAt") or datetime.now(timezone.utc).isoformat()),
            "payload": event.get("payload") if isinstance(event.get("payload"), dict) else {},
        }

    @staticmethod
    def _connect() -> sqlite3.Connection:
        path = CasperDecisionLedger._db_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(path)
        db.execute("PRAGMA journal_mode=WAL")
        return db

    @staticmethod
    def _ensure_schema(db: sqlite3.Connection) -> None:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                event_json TEXT NOT NULL
            )
            """
        )

    @staticmethod
    def _db_path() -> Path:
        return Path(get_settings().casper_decision_ledger_path)
