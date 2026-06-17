import asyncio

from app.services.cmc.daily_market_overview import CmcDailyMarketOverviewService
from app.services.cmc.daily_market_overview_prompt import DAILY_MARKET_OVERVIEW_SYSTEM_PROMPT


def test_daily_market_overview_system_prompt_matches_skill_contract() -> None:
    prompt = DAILY_MARKET_OVERVIEW_SYSTEM_PROMPT

    assert "Call find_skill exactly once" in prompt
    assert "Call execute_skill exactly once" in prompt
    assert "Do not retry on failure" in prompt
    assert "Target Telegram Markdown" in prompt
    assert "**TL;DR**" in prompt
    assert "**Details**" in prompt
    assert "exactly one line containing ———" in prompt
    assert "Return the exact error_code and reason" in prompt


def test_daily_market_overview_exposes_prompt_without_mutating_skill_params(monkeypatch) -> None:
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
                }
            }],
        }

    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.find_cmc_skill", fake_find)
    monkeypatch.setattr("app.services.cmc.daily_market_overview.CmcSkillHubClient.execute_cmc_skill", fake_execute)

    result = asyncio.run(CmcDailyMarketOverviewService.run({"preview": True}))

    assert result["systemPrompt"] == DAILY_MARKET_OVERVIEW_SYSTEM_PROMPT
    assert calls == [
        ("find", {"query": "daily_market_overview"}),
        ("execute", {"unique_name": "daily_market_overview", "parameters": {"preview": True}}),
    ]
