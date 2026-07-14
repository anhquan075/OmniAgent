import json
import os
import re
from typing import Any

import httpx

from app.core.settings import get_settings
from app.services.casper.hashing import sha256_json


class OpenRouterTraceClient:
    @staticmethod
    def fetch_role_claims(args: dict[str, Any], roles: list[dict[str, Any]]) -> dict[str, Any]:
        api_key = os.getenv("OPENROUTER_API_KEY") or get_settings().openrouter_api_key
        if not api_key:
            return {}

        for model in OpenRouterTraceClient._model_candidates():
            claims = OpenRouterTraceClient._fetch_with_model(api_key, model, args, roles)
            if claims:
                return claims
        return {}

    @staticmethod
    def _fetch_with_model(
        api_key: str,
        model: str,
        args: dict[str, Any],
        roles: list[dict[str, Any]],
    ) -> dict[str, Any]:
        settings = get_settings()
        url = f"{settings.openrouter_base_url.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-OpenRouter-Metadata": "enabled",
        }
        if settings.openrouter_site_url:
            headers["HTTP-Referer"] = settings.openrouter_site_url
        if settings.openrouter_app_title:
            headers["X-Title"] = settings.openrouter_app_title

        payload = {
            "model": model,
            "messages": OpenRouterTraceClient._messages(args, roles),
            "temperature": 0,
            "max_tokens": 700,
            "response_format": {"type": "json_object"},
        }
        try:
            with httpx.Client(timeout=settings.openrouter_timeout_sec) as client:
                response = client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            parsed = OpenRouterTraceClient._parse_claims(data)
        except (httpx.HTTPError, ValueError, TypeError, KeyError):
            return {}

        if not parsed:
            return {}
        parsed["_meta"] = {
            "provider": "openrouter",
            "model": str(data.get("model") or model),
            "generationHash": sha256_json({"id": data.get("id"), "model": data.get("model") or model}),
        }
        return parsed

    @staticmethod
    def _model_candidates() -> list[str]:
        settings = get_settings()
        raw_models = [
            os.getenv("OPENROUTER_MODEL") or settings.openrouter_model,
            os.getenv("OPENROUTER_FALLBACK_MODEL") or settings.openrouter_fallback_model,
        ]
        return [model for index, model in enumerate(raw_models) if model and model not in raw_models[:index]]

    @staticmethod
    def _messages(args: dict[str, Any], roles: list[dict[str, Any]]) -> list[dict[str, str]]:
        prompt_payload = {
            "proposedAction": args.get("proposedAction"),
            "evidenceBundle": OpenRouterTraceClient._scrub(args.get("evidenceBundle") or {}),
            "deterministicRoles": [
                {key: role.get(key) for key in ("agentRole", "verdict", "action", "reasonCodes")}
                for role in roles
            ],
        }
        return [
            {
                "role": "system",
                "content": (
                    "You are the Casper proof console trace model. Explain the deterministic "
                    "proposer, critic, and policy_gate roles without changing their decisions. "
                    "Return only JSON keyed by proposer, critic, and policy_gate. Each value must "
                    "contain verdict, action, reasonCode, and rationale."
                ),
            },
            {"role": "user", "content": json.dumps(prompt_payload, sort_keys=True)},
        ]

    @staticmethod
    def _parse_claims(data: dict[str, Any]) -> dict[str, Any]:
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(OpenRouterTraceClient._json_content(str(content)))
        if not isinstance(parsed, dict):
            return {}
        return {
            key: value
            for key, value in parsed.items()
            if key in {"proposer", "critic", "policy_gate"} and isinstance(value, dict)
        }

    @staticmethod
    def _json_content(content: str) -> str:
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, flags=re.DOTALL)
        return match.group(1) if match else content

    @staticmethod
    def _scrub(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: "[redacted]" if OpenRouterTraceClient._sensitive_key(key) else OpenRouterTraceClient._scrub(item)
                for key, item in value.items()
            }
        if isinstance(value, list):
            return [OpenRouterTraceClient._scrub(item) for item in value]
        return value

    @staticmethod
    def _sensitive_key(key: object) -> bool:
        return bool(re.search(r"(api[_-]?key|auth|private|secret|token)", str(key), flags=re.IGNORECASE))
