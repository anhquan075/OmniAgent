from datetime import datetime, timezone
from typing import Any


MAX_REPORT_CHARS = 2500


class CmcMarketReportFormatter:
    @staticmethod
    def format(result: dict[str, object]) -> str:
        error_code = result.get("error_code") or result.get("errorCode")
        if error_code:
            reason = CmcMarketReportFormatter.plain(str(result.get("reason") or "unknown"))
            return CmcMarketReportFormatter.limit_report(f"error_code: {CmcMarketReportFormatter.plain(str(error_code))}\nreason: {reason}")

        status = str(result.get("status") or "unknown")
        confidence = str(result.get("confidence") or "unknown")
        timestamp = str(result.get("timestamp") or datetime.now(timezone.utc).isoformat())
        evidence = result.get("evidencePack") if isinstance(result.get("evidencePack"), dict) else {}
        lanes = result.get("lanes") if isinstance(result.get("lanes"), dict) else {}

        blocks = [
            "**TL;DR**",
            "",
            CmcMarketReportFormatter.summary_text(evidence),
            "",
            "🚨 **Notable anomalies:**",
            "",
            *CmcMarketReportFormatter.bullets(CmcMarketReportFormatter.anomalies(evidence)),
            "",
            "📰 **Macro News:**",
            "",
            CmcMarketReportFormatter.macro_sentence(result, lanes),
            "",
            *CmcMarketReportFormatter.bullets(CmcMarketReportFormatter.macro_bullets(result, lanes)),
            "",
            "———",
            "",
            "**Details**",
            "",
        ]
        for title, values in CmcMarketReportFormatter.topic_blocks(lanes):
            blocks.extend(["", title, "", *CmcMarketReportFormatter.bullets(values), "", CmcMarketReportFormatter.takeaway(values), ""])
        blocks.extend(["", f"🕐 {timestamp} · {status} · {confidence}"])
        return CmcMarketReportFormatter.limit_report("\n".join(blocks))

    @staticmethod
    def summary_text(evidence: dict[str, Any]) -> str:
        summary = evidence.get("summary") or evidence.get("tldr") or evidence.get("tl_dr")
        if isinstance(summary, list):
            lines = [str(item).strip() for item in summary if str(item).strip()]
        elif isinstance(summary, str):
            lines = [item.strip() for item in summary.replace("\n", " ").split(". ") if item.strip()]
        else:
            lines = []
        while len(lines) < 3:
            fallbacks = [
                "The market report is available, but the skill did not provide a plain-language summary.",
                "Use this as context only and avoid treating it as permission to trade.",
                "Check the detailed values below before taking action.",
            ]
            lines.append(fallbacks[len(lines)])
        return "\n\n".join(CmcMarketReportFormatter.plain(line.rstrip(".")) + "." for line in lines[:3])

    @staticmethod
    def anomalies(evidence: dict[str, Any]) -> list[str]:
        value = evidence.get("notable_anomalies") or evidence.get("anomalies") or evidence.get("flags")
        return CmcMarketReportFormatter.values(value)[:3] or ["No notable anomaly values were provided by the skill."]

    @staticmethod
    def macro_sentence(result: dict[str, object], lanes: dict[str, object]) -> str:
        macro = result.get("macroNews") or lanes.get("macro_news") or lanes.get("macro")
        values = CmcMarketReportFormatter.values(macro)
        return CmcMarketReportFormatter.plain(values[0]) if values else "No macro news lane was provided by the skill."

    @staticmethod
    def macro_bullets(result: dict[str, object], lanes: dict[str, object]) -> list[str]:
        macro = result.get("macroNews") or lanes.get("macro_news") or lanes.get("macro")
        values = CmcMarketReportFormatter.values(macro)
        return values[1:4] or ["No macro watch items were provided by the skill."]

    @staticmethod
    def topic_blocks(lanes: dict[str, object]) -> list[tuple[str, list[str]]]:
        labels = {
            "macro": "**🏛 Macro**",
            "etf_demand": "**💰 ETF Demand**",
            "cross_asset": "**🔗 Cross-Asset**",
            "candidates": "**👁️ Candidates**",
            "market": "**📊 Market**",
            "derivatives": "**⚖️ Derivatives**",
        }
        blocks: list[tuple[str, list[str]]] = []
        for key, value in lanes.items():
            if key == "macro_news":
                continue
            items = CmcMarketReportFormatter.values(value)
            if items:
                blocks.append((labels.get(key, f"**📌 {key.replace('_', ' ').title()}**"), items[:4]))
        return blocks or [("**📊 Market**", ["The skill did not provide detailed topic lanes."])]

    @staticmethod
    def values(value: object) -> list[str]:
        if isinstance(value, str):
            return [value.strip()] if value.strip() else []
        if isinstance(value, list):
            return [CmcMarketReportFormatter.describe(item) for item in value if CmcMarketReportFormatter.describe(item)]
        if isinstance(value, dict):
            return [f"{key}: {CmcMarketReportFormatter.describe(item)}" for key, item in value.items()]
        return []

    @staticmethod
    def describe(value: object) -> str:
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, (int, float, bool)):
            return str(value)
        if isinstance(value, dict):
            parts = [f"{key}={item}" for key, item in value.items() if not isinstance(item, (dict, list))]
            return ", ".join(parts)
        return ""

    @staticmethod
    def bullets(items: list[str]) -> list[str]:
        return [f"- {CmcMarketReportFormatter.plain(item)}" for item in items if item]

    @staticmethod
    def takeaway(items: list[str]) -> str:
        first = CmcMarketReportFormatter.plain(items[0]) if items else "The skill did not provide enough detail."
        return f"💡 **Takeaway:** {first} Watch the next fresh CMC update. Keep trade size bounded."

    @staticmethod
    def plain(text: str) -> str:
        replacements = {
            "funding rate": "the fee traders pay to keep leveraged bets open",
            "open interest": "money currently sitting in futures bets",
            "NFCI": "a broad stress gauge for financial conditions",
        }
        output = text.replace("<", "").replace(">", "").replace("|", "/")
        for source, target in replacements.items():
            output = output.replace(source, target)
        return output.strip()

    @staticmethod
    def limit_report(report: str) -> str:
        if len(report) <= MAX_REPORT_CHARS:
            return report
        footer = report.split("\n")[-1]
        if not footer.startswith("🕐 "):
            return report[:MAX_REPORT_CHARS].rstrip()
        allowed = MAX_REPORT_CHARS - len(footer) - 2
        return f"{report[:allowed].rstrip()}\n\n{footer}"
