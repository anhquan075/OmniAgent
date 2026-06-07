import asyncio

from app.services.cmc.daily_market_overview import CmcDailyMarketOverviewService


def test_daily_market_overview_executes_find_validate_execute_once(monkeypatch) -> None:
    calls: list[tuple[str, dict[str, object]]] = []

    async def fake_find(args: dict[str, object]) -> dict[str, object]:
        calls.append(("find", args))
        return {
            "ready": True,
            "parsedContent": [{
                "uniqueName": "daily_market_overview",
                "inputSchema": {"type": "object", "required": ["preview"]},
            }],
        }

    async def fake_execute(args: dict[str, object]) -> dict[str, object]:
        calls.append(("execute", args))
        return {
            "ready": True,
            "parsedContent": [{
                "evidence_pack": {
                    "status": "partial",
                    "confidence": "medium",
                    "summary": ["Market is mixed", "Avoid rushing", "BTC 24h: 1.2%"],
                    "macro_news": ["Policy risk is steady", "Fed watch", "Inflation data"],
                    "anomalies": ["Funding rate: 0.05%"],
                    "lanes": {"market": ["BTC 24h: 1.2%", "ETH 24h: -0.4%"]},
                }
            }],
        }

    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.find_cmc_skill", fake_find)
    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.execute_cmc_skill", fake_execute)

    result = asyncio.run(CmcDailyMarketOverviewService.run({"preview": True}))

    assert result["ready"] is True
    assert result["uniqueName"] == "daily_market_overview"
    assert result["status"] == "partial"
    assert result["confidence"] == "medium"
    assert calls == [
        ("find", {"query": "daily_market_overview"}),
        ("execute", {"unique_name": "daily_market_overview", "parameters": {"preview": True}}),
    ]


def test_daily_market_overview_unwraps_hosted_evidence_pack(monkeypatch) -> None:
    async def fake_find(_: dict[str, object]) -> dict[str, object]:
        return {
            "ready": True,
            "parsedContent": [{
                "uniqueName": "daily_market_overview",
                "inputSchema": {"type": "object", "required": ["preview"]},
            }],
        }

    async def fake_execute(_: dict[str, object]) -> dict[str, object]:
        return {
            "ready": True,
            "parsedContent": [{
                "result": {
                    "type": "evidence_pack",
                    "skill_id": "daily_market_overview",
                    "data": {
                        "status": "partial",
                        "confidence": "medium",
                        "summary": "The daily market overview produced a partial market read.",
                        "risk_flags": ["high volatility token risk"],
                        "macro_deep_read": {
                            "macro_news": {
                                "market_view": {"takeaway": "Risk-off sentiment is weighing on crypto."},
                                "key_event_summary": ["Jobs data pushed rate worries higher."],
                                "watchlist": ["Fed policy signals"],
                            },
                            "etf_demand": {"key_metrics": ["Latest BTC ETF flow (2026-06-05) $-325.70M"]},
                            "cross_asset": {"conflicts": ["Cross-asset read is mixed or crypto-specific."]},
                        },
                        "watchlist": [{"symbol": "SIREN", "score": 85.67}],
                    },
                },
                "executionMeta": {"executionTimeMs": "53381"},
            }],
        }

    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.find_cmc_skill", fake_find)
    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.execute_cmc_skill", fake_execute)

    result = asyncio.run(CmcDailyMarketOverviewService.run({"preview": True}))

    assert result["ready"] is True
    assert result["status"] == "partial"
    assert result["confidence"] == "medium"
    assert result["macroNews"]
    assert "Risk-off sentiment is weighing on crypto." in result["formattedReport"]
    assert "Jobs data pushed rate worries higher." in result["formattedReport"]
    assert "Latest BTC ETF flow (2026-06-05) $-325.70M" in result["formattedReport"]


def test_daily_market_overview_stops_when_required_param_missing(monkeypatch) -> None:
    calls: list[str] = []

    async def fake_find(_: dict[str, object]) -> dict[str, object]:
        calls.append("find")
        return {
            "ready": True,
            "parsedContent": [{
                "unique_name": "daily_market_overview",
                "input_schema": {"required": ["preview"]},
            }],
        }

    async def fake_execute(_: dict[str, object]) -> dict[str, object]:
        calls.append("execute")
        return {"ready": True}

    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.find_cmc_skill", fake_find)
    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.execute_cmc_skill", fake_execute)

    result = asyncio.run(CmcDailyMarketOverviewService.run({"parameters": {}}))

    assert result["ready"] is False
    assert result["error_code"] == "missing_required_param"
    assert "preview" in result["reason"]
    assert calls == ["find"]


def test_daily_market_overview_does_not_retry_execute_failure(monkeypatch) -> None:
    calls: list[str] = []

    async def fake_find(_: dict[str, object]) -> dict[str, object]:
        calls.append("find")
        return {"ready": True, "parsedContent": [{"uniqueName": "daily_market_overview"}]}

    async def fake_execute(_: dict[str, object]) -> dict[str, object]:
        calls.append("execute")
        return {"ready": False, "reason": "upstream timeout"}

    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.find_cmc_skill", fake_find)
    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.execute_cmc_skill", fake_execute)

    result = asyncio.run(CmcDailyMarketOverviewService.run({"preview": True}))

    assert result["error_code"] == "execute_skill_failed"
    assert result["reason"] == "upstream timeout"
    assert calls == ["find", "execute"]


def test_daily_market_overview_stops_on_skill_level_error(monkeypatch) -> None:
    calls: list[str] = []

    async def fake_find(_: dict[str, object]) -> dict[str, object]:
        calls.append("find")
        return {"ready": True, "parsedContent": [{"uniqueName": "daily_market_overview"}]}

    async def fake_execute(_: dict[str, object]) -> dict[str, object]:
        calls.append("execute")
        return {
            "ready": True,
            "parsedContent": [{
                "status": "error",
                "error_code": "cmc_skill_unavailable",
                "reason": "hosted skill unavailable",
            }],
        }

    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.find_cmc_skill", fake_find)
    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.execute_cmc_skill", fake_execute)

    result = asyncio.run(CmcDailyMarketOverviewService.run({"preview": True}))

    assert result["ready"] is False
    assert result["error_code"] == "cmc_skill_unavailable"
    assert result["reason"] == "hosted skill unavailable"
    assert calls == ["find", "execute"]


def test_daily_market_overview_stops_on_nested_mcp_result_error(monkeypatch) -> None:
    calls: list[str] = []

    async def fake_find(_: dict[str, object]) -> dict[str, object]:
        calls.append("find")
        return {"ready": True, "parsedContent": [{"uniqueName": "daily_market_overview"}]}

    async def fake_execute(_: dict[str, object]) -> dict[str, object]:
        calls.append("execute")
        return {
            "ready": True,
            "result": {
                "isError": True,
                "content": [{"type": "text", "text": "hosted skill unavailable"}],
            },
            "parsedContent": [{"message": "hosted skill unavailable"}],
        }

    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.find_cmc_skill", fake_find)
    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.execute_cmc_skill", fake_execute)

    result = asyncio.run(CmcDailyMarketOverviewService.run({"preview": True}))

    assert result["ready"] is False
    assert result["error_code"] == "execute_skill_failed"
    assert result["reason"] == "hosted skill unavailable"
    assert calls == ["find", "execute"]


def test_daily_market_overview_preserves_status_error_reason(monkeypatch) -> None:
    async def fake_find(_: dict[str, object]) -> dict[str, object]:
        return {"ready": True, "parsedContent": [{"uniqueName": "daily_market_overview"}]}

    async def fake_execute(_: dict[str, object]) -> dict[str, object]:
        return {"ready": True, "parsedContent": [{"status": "error", "reason": "hosted skill unavailable"}]}

    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.find_cmc_skill", fake_find)
    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.execute_cmc_skill", fake_execute)

    result = asyncio.run(CmcDailyMarketOverviewService.run({"preview": True}))

    assert result["ready"] is False
    assert result["error_code"] == "execute_skill_failed"
    assert result["reason"] == "hosted skill unavailable"


def test_daily_market_overview_rejects_discovery_mismatch(monkeypatch) -> None:
    async def fake_find(_: dict[str, object]) -> dict[str, object]:
        return {"ready": True, "parsedContent": [{"uniqueName": "other_skill"}]}

    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.find_cmc_skill", fake_find)

    result = asyncio.run(CmcDailyMarketOverviewService.run({"preview": True}))

    assert result["ready"] is False
    assert result["error_code"] == "skill_not_found"
