from datetime import datetime, timezone
import re
from typing import Any
from uuid import uuid4


_SAFE_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$")


def new_cycle_context(origin: str = "manual") -> dict[str, str]:
    return {
        "cycleId": str(uuid4()),
        "origin": _safe_token(origin, "manual", 32),
        "startedAt": datetime.now(timezone.utc).isoformat(),
    }


def normalize_cycle_context(
    value: object,
    *,
    fallback_origin: str = "manual",
) -> dict[str, str]:
    source = value if isinstance(value, dict) else {}
    cycle_id = str(source.get("cycleId") or source.get("cycle_id") or "").strip()
    origin = str(source.get("origin") or fallback_origin).strip()
    started_at = str(source.get("startedAt") or source.get("started_at") or "").strip()
    return {
        "cycleId": cycle_id if _SAFE_TOKEN.fullmatch(cycle_id) else str(uuid4()),
        "origin": _safe_token(origin, fallback_origin, 32),
        "startedAt": _safe_timestamp(started_at),
    }


def cycle_payload(cycle_context: dict[str, Any], tools_used: list[str]) -> dict[str, Any]:
    context = normalize_cycle_context(cycle_context)
    tools = [
        str(tool)
        for tool in tools_used
        if isinstance(tool, str) and _SAFE_TOKEN.fullmatch(tool) and len(tool) <= 64
    ]
    return {
        "cycleContext": context,
        "toolsUsed": list(dict.fromkeys(tools)),
    }


def _safe_token(value: str, fallback: str, limit: int) -> str:
    selected = value[:limit]
    if selected and _SAFE_TOKEN.fullmatch(selected):
        return selected
    return fallback


def _safe_timestamp(value: str) -> str:
    if value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).isoformat()
        except ValueError:
            pass
    return datetime.now(timezone.utc).isoformat()
