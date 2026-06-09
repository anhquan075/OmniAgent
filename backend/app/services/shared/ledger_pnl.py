from datetime import datetime, timezone
from typing import Any


class LedgerPnl:
    @staticmethod
    def parse_timestamp(value: object) -> datetime | None:
        if not isinstance(value, str) or not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
        except ValueError:
            return None

    @staticmethod
    def from_event(event: dict[str, Any]) -> dict[str, float] | None:
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        for candidate in (payload, event):
            if "totalReturnPct" in candidate or "maxDrawdownPct" in candidate:
                return {
                    "totalReturnPct": float(candidate.get("totalReturnPct") or 0),
                    "maxDrawdownPct": float(candidate.get("maxDrawdownPct") or 0),
                }
        return None

    @staticmethod
    def latest(events: list[dict[str, Any]]) -> dict[str, object]:
        for event in reversed(events):
            pnl = LedgerPnl.from_event(event)
            if pnl is not None:
                return {
                    **pnl,
                    "registrationPeriod": LedgerPnl.registration_period(events),
                }
        return {
            "totalReturnPct": 0,
            "maxDrawdownPct": 0,
            "registrationPeriod": LedgerPnl.registration_period(events),
        }

    @staticmethod
    def registration_period(events: list[dict[str, Any]]) -> dict[str, object]:
        as_of = datetime.now(timezone.utc)
        registration = next(
            (
                event for event in events
                if event.get("eventType") == "competition_registered"
            ),
            None,
        )
        if registration is None:
            return LedgerPnl.empty_registration_period(as_of)

        start = LedgerPnl.parse_timestamp(registration.get("createdAt")) or as_of
        baseline_return = 0.0
        latest_return = 0.0
        period_drawdown = 0.0
        latest_pnl_at: datetime | None = None

        for event in events:
            pnl = LedgerPnl.from_event(event)
            if pnl is None:
                continue
            timestamp = LedgerPnl.parse_timestamp(event.get("createdAt"))
            if timestamp is not None and timestamp <= start:
                baseline_return = pnl["totalReturnPct"]
                latest_return = baseline_return
                latest_pnl_at = timestamp
                continue
            if timestamp is None or timestamp <= as_of:
                latest_return = pnl["totalReturnPct"]
                latest_pnl_at = timestamp
                if timestamp is None or timestamp >= start:
                    period_drawdown = max(period_drawdown, pnl["maxDrawdownPct"])

        payload = registration.get("payload") if isinstance(registration.get("payload"), dict) else {}
        days = max(1, (as_of.date() - start.date()).days + 1)
        return {
            "source": "competition_registered",
            "registrationStartAt": start.isoformat(),
            "registrationTxHash": registration.get("txHash") or payload.get("txHash"),
            "asOf": as_of.isoformat(),
            "days": days,
            "latestPnlAt": latest_pnl_at.isoformat() if latest_pnl_at else None,
            "totalReturnPct": latest_return - baseline_return,
            "maxDrawdownPct": period_drawdown,
        }

    @staticmethod
    def empty_registration_period(as_of: datetime) -> dict[str, object]:
        return {
            "source": "no_registration",
            "registrationStartAt": None,
            "registrationTxHash": None,
            "asOf": as_of.isoformat(),
            "days": 0,
            "latestPnlAt": None,
            "totalReturnPct": 0,
            "maxDrawdownPct": 0,
        }
