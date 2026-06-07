from typing import Any


class CmcSkillResultParser:
    @staticmethod
    def first_skill_candidate(payload: dict[str, object]) -> dict[str, Any] | None:
        for candidate in CmcSkillResultParser.skill_candidates(payload):
            if isinstance(candidate, dict):
                return candidate
        return None

    @staticmethod
    def skill_candidates(payload: dict[str, object]) -> list[object]:
        direct = payload.get("candidates") or payload.get("skills")
        if isinstance(direct, list):
            return direct
        parsed = payload.get("parsedContent")
        if isinstance(parsed, list):
            if len(parsed) == 1 and isinstance(parsed[0], dict):
                nested = parsed[0].get("candidates") or parsed[0].get("skills")
                if isinstance(nested, list):
                    return nested
            return parsed
        if isinstance(parsed, dict):
            nested = parsed.get("candidates") or parsed.get("skills")
            if isinstance(nested, list):
                return nested
            return [parsed]
        return []

    @staticmethod
    def unique_name(candidate: dict[str, Any] | None) -> str | None:
        if not candidate:
            return None
        value = candidate.get("unique_name") or candidate.get("uniqueName") or candidate.get("name")
        return str(value).strip() if value else None

    @staticmethod
    def input_schema(candidate: dict[str, Any] | None) -> dict[str, Any] | None:
        if not candidate:
            return None
        schema = candidate.get("input_schema") or candidate.get("inputSchema")
        return schema if isinstance(schema, dict) else None

    @staticmethod
    def first_execution_payload(payload: dict[str, object]) -> dict[str, Any]:
        parsed = payload.get("parsedContent")
        if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
            return parsed[0]
        if isinstance(parsed, dict):
            return parsed
        result = payload.get("result")
        return result if isinstance(result, dict) else {}

    @staticmethod
    def normalize_execution(payload: dict[str, object]) -> dict[str, object]:
        execution = CmcSkillResultParser.first_execution_payload(payload)
        evidence = execution.get("evidence_pack") if isinstance(execution.get("evidence_pack"), dict) else execution
        status = evidence.get("status") or execution.get("status") or payload.get("status") or "unknown"
        confidence = evidence.get("confidence") or execution.get("confidence") or payload.get("confidence") or "unknown"
        return {
            "status": status,
            "confidence": confidence,
            "evidencePack": evidence,
            "macroNews": CmcSkillResultParser.extract_lane(evidence, "macro_news"),
            "lanes": CmcSkillResultParser.extract_lanes(evidence),
            "rawSkillOutput": execution,
        }

    @staticmethod
    def extract_lane(payload: dict[str, Any], key: str) -> object:
        value = payload.get(key)
        if value is not None:
            return value
        lanes = payload.get("lanes")
        if isinstance(lanes, dict):
            return lanes.get(key)
        return None

    @staticmethod
    def extract_lanes(payload: dict[str, Any]) -> dict[str, object]:
        lanes = payload.get("lanes")
        if isinstance(lanes, dict):
            return lanes
        return {
            key: value
            for key, value in payload.items()
            if key not in {"status", "confidence", "summary", "tldr", "macro_news"}
            and isinstance(value, (dict, list))
        }
