import json
import os
from typing import Any

from app.core.settings import get_settings
from app.services.casper.hashing import sha256_json, sha256_text
from app.services.casper.openrouter_trace import OpenRouterTraceClient


class CasperLlmTraceService:
    @staticmethod
    def annotate_roles(roles: list[dict[str, Any]], args: dict[str, Any]) -> list[dict[str, Any]]:
        enabled = CasperLlmTraceService._trace_enabled()
        capture = OpenRouterTraceClient.fetch_role_claims(args, roles) if enabled else {}
        if not capture:
            capture = CasperLlmTraceService._capture()
        meta = capture.get("_meta") if isinstance(capture.get("_meta"), dict) else {}
        source = "llm" if enabled and meta.get("provider") == "openrouter" else "deterministic"
        for role in roles:
            role_name = str(role.get("agentRole") or "unknown")
            role_capture = capture.get(role_name) if isinstance(capture.get(role_name), dict) else {}
            public_claims = CasperLlmTraceService._public_claims(role_capture)
            role["traceSource"] = source
            role["promptHash"] = sha256_json(
                {
                    "agentRole": role_name,
                    "proposedAction": args.get("proposedAction"),
                    "evidenceBundle": args.get("evidenceBundle") or {},
                }
            )
            if source == "llm":
                role["traceProvider"] = str(meta.get("provider") or CasperLlmTraceService._provider())
                role["modelName"] = str(meta.get("model") or CasperLlmTraceService._model())
                if meta.get("generationHash"):
                    role["modelGenerationHash"] = str(meta["generationHash"])
                if public_claims:
                    role["modelClaimHash"] = sha256_json(public_claims)
            role["outputHash"] = CasperLlmTraceService._output_hash(role)
        return roles

    @staticmethod
    def _trace_enabled() -> bool:
        value = os.getenv("CASPER_LLM_TRACE_ENABLED")
        if value is None:
            return get_settings().casper_llm_trace_enabled
        return value.strip().lower() in {"1", "true", "yes", "on"}

    @staticmethod
    def _capture() -> dict[str, Any]:
        raw = os.getenv("CASPER_LLM_TRACE_CAPTURE") or get_settings().casper_llm_trace_capture
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except ValueError:
            return {"captureErrorHash": sha256_text(raw)}
        return parsed if isinstance(parsed, dict) else {}

    @staticmethod
    def _provider() -> str:
        return os.getenv("CASPER_LLM_TRACE_PROVIDER") or get_settings().casper_llm_trace_provider

    @staticmethod
    def _model() -> str:
        return os.getenv("OPENROUTER_MODEL") or os.getenv("CASPER_LLM_TRACE_MODEL") or get_settings().casper_llm_trace_model

    @staticmethod
    def _public_claims(capture: dict[str, Any]) -> dict[str, str]:
        allowed = ("action", "verdict", "reasonCode", "rationale")
        return {
            key: sha256_text(str(capture[key])) if key == "rationale" else str(capture[key])
            for key in allowed
            if capture.get(key) is not None
        }

    @staticmethod
    def _output_hash(role: dict[str, Any]) -> str:
        payload = {key: value for key, value in role.items() if key != "outputHash"}
        return sha256_json(payload)
