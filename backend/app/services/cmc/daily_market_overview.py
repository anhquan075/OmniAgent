from datetime import datetime, timezone
from typing import Any

from app.services.cmc.market_report_formatter import CmcMarketReportFormatter
from app.services.cmc.skill_hub import CmcSkillHubClient
from app.services.cmc.skill_result_parser import CmcSkillResultParser
from app.services.cmc.skill_schema import CmcSkillSchemaValidator
from app.services.shared.ledger import TradeLedger

DEFAULT_SKILL_NAME = "daily_market_overview"
DEFAULT_PARAMS = {"preview": True}


class CmcDailyMarketOverviewService:
    @staticmethod
    async def run(args: dict[str, object] | None = None) -> dict[str, object]:
        args = args or {}
        record_ledger = bool(args.get("recordLedger"))
        parameters = CmcDailyMarketOverviewService.parameters(args)
        timestamp = datetime.now(timezone.utc).isoformat()

        found = await CmcSkillHubClient.find_cmc_skill({"query": DEFAULT_SKILL_NAME})
        if not found.get("ready"):
            return CmcDailyMarketOverviewService.error("find_skill_failed", found.get("reason"), found, timestamp)

        candidate = CmcSkillResultParser.first_skill_candidate(found)
        unique_name = CmcSkillResultParser.unique_name(candidate)
        input_schema = CmcSkillResultParser.input_schema(candidate)
        if unique_name != DEFAULT_SKILL_NAME:
            return CmcDailyMarketOverviewService.error(
                "skill_not_found",
                f"find_skill did not return unique_name {DEFAULT_SKILL_NAME}",
                found,
                timestamp,
                unique_name=unique_name,
                input_schema=input_schema,
            )

        validation = CmcSkillSchemaValidator.validate(parameters, input_schema)
        if not validation.valid:
            return CmcDailyMarketOverviewService.error(
                "missing_required_param",
                validation.reason,
                found,
                timestamp,
                unique_name=unique_name,
                input_schema=input_schema,
                parameters=parameters,
            )

        executed = await CmcSkillHubClient.execute_cmc_skill({"unique_name": unique_name, "parameters": parameters})
        if not executed.get("ready"):
            return CmcDailyMarketOverviewService.error(
                "execute_skill_failed",
                executed.get("reason"),
                executed,
                timestamp,
                unique_name=unique_name,
                input_schema=input_schema,
                parameters=parameters,
            )

        normalized = CmcSkillResultParser.normalize_execution(executed)
        execution_error = CmcDailyMarketOverviewService.execution_error(normalized, executed)
        if execution_error:
            return CmcDailyMarketOverviewService.error(
                execution_error["error_code"],
                execution_error["reason"],
                executed,
                timestamp,
                unique_name=unique_name,
                input_schema=input_schema,
                parameters=parameters,
            )

        result: dict[str, object] = {
            "source": "coinmarketcap-skill-hub",
            "skillName": DEFAULT_SKILL_NAME,
            "uniqueName": unique_name,
            "inputSchema": input_schema or {},
            "parameters": parameters,
            "ready": True,
            "timestamp": timestamp,
            **normalized,
        }
        result["formattedReport"] = CmcMarketReportFormatter.format(result)
        if record_ledger:
            result["ledgerEvent"] = CmcDailyMarketOverviewService.record_event(result)
        return result

    @staticmethod
    def parameters(args: dict[str, object]) -> dict[str, object]:
        nested = args.get("parameters") or args.get("params")
        if isinstance(nested, dict):
            return dict(nested)
        params = {key: value for key, value in args.items() if key not in {"recordLedger"}}
        return params or dict(DEFAULT_PARAMS)

    @staticmethod
    def execution_error(normalized: dict[str, object], executed: dict[str, object]) -> dict[str, str] | None:
        status = str(normalized.get("status") or "").lower()
        candidates = [
            normalized.get("rawSkillOutput"),
            normalized.get("evidencePack"),
            executed.get("result"),
            executed,
        ]
        result = executed.get("result")
        if isinstance(result, dict):
            candidates.append(result.get("structuredContent"))
            content = result.get("content")
            if isinstance(content, list):
                candidates.extend(content)
        parsed = executed.get("parsedContent")
        if isinstance(parsed, list):
            candidates.extend(parsed)
        elif isinstance(parsed, dict):
            candidates.append(parsed)

        fallback_reason = CmcDailyMarketOverviewService.first_error_reason(candidates)
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            code = candidate.get("error_code") or candidate.get("errorCode")
            reason = CmcDailyMarketOverviewService.error_reason(candidate) or fallback_reason or code
            if code:
                return {"error_code": str(code), "reason": str(reason or code)}
            if candidate.get("isError") is True:
                return {"error_code": "execute_skill_failed", "reason": str(reason or "execute_skill_failed")}
        if status == "error":
            return {"error_code": "execute_skill_failed", "reason": fallback_reason or "execute_skill returned status error"}
        return None

    @staticmethod
    def first_error_reason(candidates: list[object]) -> str | None:
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            reason = CmcDailyMarketOverviewService.error_reason(candidate)
            if reason:
                return reason
        return None

    @staticmethod
    def error_reason(candidate: dict[str, object]) -> str | None:
        reason = candidate.get("reason") or candidate.get("message") or candidate.get("error")
        if isinstance(reason, dict):
            reason = reason.get("message") or reason.get("reason") or reason.get("code")
        if reason:
            return str(reason)
        text = candidate.get("text")
        return str(text) if text else None

    @staticmethod
    def error(
        error_code: str,
        reason: object,
        raw: dict[str, object],
        timestamp: str,
        **extra: object,
    ) -> dict[str, object]:
        result = {
            "source": "coinmarketcap-skill-hub",
            "skillName": DEFAULT_SKILL_NAME,
            "ready": False,
            "status": "error",
            "confidence": "none",
            "error_code": error_code,
            "errorCode": error_code,
            "reason": str(reason or error_code),
            "timestamp": timestamp,
            "rawSkillOutput": raw,
            **extra,
        }
        result["formattedReport"] = CmcMarketReportFormatter.format(result)
        return result

    @staticmethod
    def record_event(result: dict[str, object]) -> dict[str, Any]:
        return TradeLedger.append_event({
            "eventType": "cmc_market_overview_report",
            "createdAt": result.get("timestamp"),
            "payload": {
                "skillName": result.get("skillName"),
                "uniqueName": result.get("uniqueName"),
                "status": result.get("status"),
                "confidence": result.get("confidence"),
                "formattedReport": result.get("formattedReport"),
            },
        })
