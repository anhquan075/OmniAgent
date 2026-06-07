import json
from typing import Any

import httpx

from app.core.settings import get_settings


TRADING_ADVISOR_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["buy", "sell", "hold"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "maxAmountUsd": {"type": "number", "minimum": 0},
        "slippageBps": {"type": "integer", "minimum": 0, "maximum": 300},
        "rationale": {"type": "string"},
        "risks": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
        "dataQuality": {"type": "string", "enum": ["strong", "medium", "weak"]},
    },
    "required": ["action", "confidence", "maxAmountUsd", "slippageBps", "rationale", "risks", "dataQuality"],
    "additionalProperties": False,
}


SYSTEM_PROMPT = """
You are OmniAgent's BSC trading risk advisor. Preserve capital first.
Use only supplied CMC, CMC Agent Hub, tactical chart signal, ledger, quote, and policy context.
Never promise profit. Prefer HOLD when data is stale, missing, contradictory, or overextended.
Approve tiny BSC trades only when signal quality, momentum, and policy context agree.
Never approve non-allowlisted tokens, excessive slippage, or trades above configured caps.
Return strict JSON only. Do not include markdown.
""".strip()


class OpenRouterTradingAdvisor:
    @staticmethod
    async def advise(payload: dict[str, Any]) -> dict[str, Any]:
        settings = get_settings()
        if not settings.openrouter_api_key:
            return {"ready": False, "reason": "OPENROUTER_API_KEY is not configured"}
        body = OpenRouterTradingAdvisor.request_body(settings.openrouter_model, payload)
        headers = {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
        }
        if settings.openrouter_site_url:
            headers["HTTP-Referer"] = settings.openrouter_site_url
        if settings.openrouter_app_name:
            headers["X-Title"] = settings.openrouter_app_name
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(
                    f"{settings.openrouter_base_url.rstrip('/')}/chat/completions",
                    headers=headers,
                    json=body,
                )
                response.raise_for_status()
                raw = response.json()
        except httpx.HTTPError as error:
            return {"ready": False, "model": settings.openrouter_model, "reason": str(error)}
        decision = OpenRouterTradingAdvisor.parse_decision(raw)
        if not decision:
            return {"ready": False, "model": settings.openrouter_model, "reason": "model_returned_invalid_json"}
        return {
            "ready": True,
            "model": settings.openrouter_model,
            "decision": OpenRouterTradingAdvisor.normalize_decision(decision),
            "usage": raw.get("usage") if isinstance(raw.get("usage"), dict) else None,
        }

    @staticmethod
    def request_body(model: str, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(payload, separators=(",", ":"), default=str)},
            ],
            "temperature": 0.1,
            "max_tokens": 420,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "trading_advice", "strict": True, "schema": TRADING_ADVISOR_SCHEMA},
            },
            "provider": {"require_parameters": True},
        }

    @staticmethod
    def parse_decision(raw: dict[str, Any]) -> dict[str, Any] | None:
        choices = raw.get("choices") if isinstance(raw.get("choices"), list) else []
        message = (choices[0] or {}).get("message") if choices else {}
        content = message.get("content") if isinstance(message, dict) else None
        if isinstance(content, list):
            content = "".join(str(item.get("text") or "") for item in content if isinstance(item, dict))
        if not isinstance(content, str) or not content.strip():
            return None
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None

    @staticmethod
    def normalize_decision(decision: dict[str, Any]) -> dict[str, Any]:
        return {
            "action": str(decision.get("action") or "hold").lower(),
            "confidence": max(0.0, min(float(decision.get("confidence") or 0), 1.0)),
            "maxAmountUsd": max(float(decision.get("maxAmountUsd") or 0), 0.0),
            "slippageBps": max(0, int(decision.get("slippageBps") or 0)),
            "rationale": str(decision.get("rationale") or "No rationale returned."),
            "risks": [str(item) for item in decision.get("risks") or []][:5],
            "dataQuality": str(decision.get("dataQuality") or "weak"),
        }
