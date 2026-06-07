from app.services.cmc.market_report_formatter import CmcMarketReportFormatter


def sample_result() -> dict[str, object]:
    return {
        "status": "partial",
        "confidence": "medium",
        "timestamp": "2026-06-07T09:00:00+00:00",
        "evidencePack": {
            "summary": [
                "Markets are choppy around BTC and ETH",
                "Avoid oversized trades until the next update",
                "BTC 24h: 1.2% and funding rate: 0.05%",
            ],
            "anomalies": ["funding rate: 0.05%", "open interest: $2.1B"],
        },
        "macroNews": ["Rates are the main watch item", "Fed meeting", "Inflation print"],
        "lanes": {
            "macro_news": ["ignored duplicate"],
            "market": ["Total cap: $2.5T", "BTC dominance: 53%"],
            "derivatives": ["funding rate: 0.05%"],
        },
    }


def test_formatter_outputs_telegram_markdown_contract() -> None:
    report = CmcMarketReportFormatter.format(sample_result())

    assert report.startswith("**TL;DR**\n\n")
    assert "\n———\n\n**Details**\n" in report
    assert report.count("———") == 1
    assert "🚨 **Notable anomalies:**\n\n- " in report
    assert "📰 **Macro News:**\n\n" in report
    assert "**📊 Market**" in report
    assert "💡 **Takeaway:**" in report
    assert report.endswith("🕐 2026-06-07T09:00:00+00:00 · partial · medium")
    assert len(report) <= 2500


def test_formatter_removes_table_and_html_markers() -> None:
    result = sample_result()
    result["evidencePack"] = {"summary": ["<b>Market</b> | mixed", "Avoid risk", "BTC: 1%"]}

    report = CmcMarketReportFormatter.format(result)

    assert "<" not in report
    assert ">" not in report
    assert "|" not in report


def test_formatter_error_stops_with_code_and_reason() -> None:
    report = CmcMarketReportFormatter.format({"error_code": "missing_required_param", "reason": "<preview>|missing"})

    assert report == "error_code: missing_required_param\nreason: preview/missing"
    assert "<" not in report
    assert ">" not in report
    assert "|" not in report


def test_formatter_limits_long_error_report() -> None:
    report = CmcMarketReportFormatter.format({"error_code": "execute_skill_failed", "reason": "x" * 4000})

    assert len(report) <= 2500
