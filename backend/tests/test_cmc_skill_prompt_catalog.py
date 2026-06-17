import asyncio

from app.services.cmc.skill_prompt_catalog import CmcSkillPromptCatalog, MARKETPLACE_URL, PROMPT_SPECS
from app.services.mcp.tools import McpToolRegistry


def test_skill_prompt_catalog_includes_marketplace_prompts() -> None:
    result = CmcSkillPromptCatalog.list_prompts()
    names = {item["uniqueName"] for item in result["prompts"]}  # type: ignore[index]

    assert result["marketplaceUrl"] == MARKETPLACE_URL
    assert result["count"] == len(PROMPT_SPECS)
    assert "perp_contract_analysis" in names
    assert "btc_cross_asset_correlation" in names
    assert "altcoin_scanner_perp" in names
    assert "btc_etf_institutional_demand" in names
    assert "onchain_token_scanner" in names


def test_skill_prompt_catalog_filters_by_query() -> None:
    result = CmcSkillPromptCatalog.list_prompts({"query": "etf", "limit": 5})
    prompts = result["prompts"]  # type: ignore[index]

    assert result["count"] == 1
    assert prompts[0]["uniqueName"] == "btc_etf_institutional_demand"  # type: ignore[index]
    assert "ETF" in str(prompts[0]["systemPrompt"])  # type: ignore[index]


def test_skill_prompt_contract_uses_reference_execution_and_format() -> None:
    prompt = CmcSkillPromptCatalog.prompt_for("altcoin_scanner_perp")

    assert "Call find_skill exactly once" in prompt
    assert "Call execute_skill exactly once" in prompt
    assert "Do not retry on failure" in prompt
    assert "Target: Telegram markdown" in prompt
    assert "**TL;DR**" in prompt
    assert "**Details**" in prompt
    assert "On error, state the exact error_code and reason" in prompt


def test_skill_prompt_catalog_tool_is_allowlisted() -> None:
    tool_names = {tool["name"] for tool in McpToolRegistry.list_tools()}
    result = asyncio.run(McpToolRegistry.call_tool("cmc_skill_prompt_catalog", {"query": "macro", "limit": 2}))
    payload = result.model_dump()

    assert "cmc_skill_prompt_catalog" in tool_names
    assert payload["count"] == 2
    assert all("systemPrompt" in item for item in payload["prompts"])
