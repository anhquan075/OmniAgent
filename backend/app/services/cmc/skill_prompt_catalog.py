from dataclasses import dataclass


MARKETPLACE_URL = "https://coinmarketcap.com/api/skills-marketplace/"


@dataclass(frozen=True)
class CmcSkillPromptSpec:
    unique_name: str
    display_name: str
    default_params: str
    task: str
    topics: tuple[str, ...]
    limits: str


PROMPT_SPECS: dict[str, CmcSkillPromptSpec] = {
    "daily_market_overview": CmcSkillPromptSpec(
        "daily_market_overview",
        "daily market overview",
        '{"preview": true}',
        "Produce a morning crypto regime briefing across macro, liquidity, ETF demand, cross-asset context, candidates, and risk budget.",
        ("**🏛 Macro**", "**💧 Liquidity**", "**💰 ETF Demand**", "**🔗 Cross-Asset**", "**👁️ Candidates**"),
        "Research context only; partial lanes must stay visible and must not become trade instructions.",
    ),
    "perp_contract_analysis": CmcSkillPromptSpec(
        "perp_contract_analysis",
        "perp contract analysis",
        '{"symbol": "BNB"}',
        "Summarize perp market structure, positioning pressure, funding, open interest, and liquidation heatmap pressure points.",
        ("**⚖️ Perp Structure**", "**🔥 Liquidations**", "**💸 Funding**", "**📍 Levels**"),
        "Use as market-structure context, not as an execution engine; block or mark partial when futures inputs are missing.",
    ),
    "btc_cross_asset_correlation": CmcSkillPromptSpec(
        "btc_cross_asset_correlation",
        "btc cross asset correlation",
        '{"preview": true}',
        "Explain BTC's macro-regime link to stocks, dollar liquidity, gold, oil, and divergence signals.",
        ("**🔗 Correlations**", "**💵 Dollar Liquidity**", "**🥇 Gold/Oil**", "**⚠️ Divergences**"),
        "Requires enough aligned histories; output is contextual evidence, never a standalone BTC trade trigger.",
    ),
    "altcoin_scanner_perp": CmcSkillPromptSpec(
        "altcoin_scanner_perp",
        "altcoin scanner perp",
        '{"preview": true}',
        "Rank perp altcoin setups into immediate review, secondary review, and watchlist buckets.",
        ("**⚖️ Perp Candidates**", "**🔥 Crowding Risk**", "**📊 Confirmation**", "**👁️ Watchlist**"),
        "Downgrade missing or contradictory spot confirmation instead of promoting candidates to direct execution.",
    ),
    "btc_etf_institutional_demand": CmcSkillPromptSpec(
        "btc_etf_institutional_demand",
        "btc etf institutional demand",
        '{"preview": true}',
        "Score whether BTC ETF flows are backed by real spot absorption and long-term holder behavior.",
        ("**💰 ETF Flows**", "**📦 Spot Absorption**", "**🧊 Holder Supply**", "**⚠️ Divergence**"),
        "Treat headline ETF flow as insufficient unless confirmation lanes are fresh and complete.",
    ),
    "altcoin_breakout_scanner_spot": CmcSkillPromptSpec(
        "altcoin_breakout_scanner_spot",
        "altcoin breakout scanner spot",
        '{"preview": true}',
        "Rank spot-altcoin breakout candidates that pass price, volume, trend, and narrative confirmation checks.",
        ("**📈 Breakouts**", "**🔊 Volume**", "**🧭 Trend**", "**🗞 Narrative**"),
        "Use for right-side momentum triage; sparse narrative coverage must remain a technical-only caveat.",
    ),
    "crypto_macro_overview": CmcSkillPromptSpec(
        "crypto_macro_overview",
        "crypto macro overview",
        '{"preview": true}',
        "Synthesize market pulse, macro pressure, liquidity, ETF demand, cross-asset context, and sentiment.",
        ("**🏛 Macro**", "**💧 Liquidity**", "**💰 ETF Demand**", "**😐 Sentiment**"),
        "Unavailable data must remain visible; no trade execution instruction is allowed.",
    ),
    "kline_pattern_recognition": CmcSkillPromptSpec(
        "kline_pattern_recognition",
        "kline pattern recognition",
        '{"symbol": "BNB"}',
        "Detect candlestick and classical chart patterns with confirmation, freshness, and invalidation levels.",
        ("**📐 Pattern**", "**✅ Confirmation**", "**⛔ Invalidation**", "**🕐 Freshness**"),
        "Sparse or noisy histories must produce insufficient-data language rather than forced pattern claims.",
    ),
    "altcoin_token_profile": CmcSkillPromptSpec(
        "altcoin_token_profile",
        "altcoin token profile",
        '{"symbol": "BNB", "quote": "USD"}',
        "Summarize token identity, market snapshot, protocol context, holder coverage, and fundamental gaps.",
        ("**🪪 Identity**", "**📊 Market Snapshot**", "**🏗 Protocol**", "**⚠️ Gaps**"),
        "Do not guess unavailable holder, fee, revenue, BTC-relative, or protocol-history lanes.",
    ),
    "macro_liquidity_monitor": CmcSkillPromptSpec(
        "macro_liquidity_monitor",
        "macro liquidity monitor",
        '{"preview": true}',
        "Explain whether global liquidity is supportive, neutral, or restrictive for crypto risk appetite.",
        ("**💧 Liquidity**", "**🏦 Policy**", "**💵 Dollar**", "**⚠️ Stress**"),
        "Keep unavailable macro series explicit and treat the result as research context.",
    ),
    "onchain_token_scanner": CmcSkillPromptSpec(
        "onchain_token_scanner",
        "onchain token scanner",
        '{"chain": "bsc"}',
        "Surface fresh onchain candidates with liquidity bootstrap, holder growth, smart-money flow, and trading quality.",
        ("**🔎 Candidates**", "**💧 Liquidity**", "**👥 Holders**", "**🛡 Risk Filters**"),
        "Results are watchlist candidates only; obvious rug patterns and missing lanes must be called out.",
    ),
    "macro_news_aggregator": CmcSkillPromptSpec(
        "macro_news_aggregator",
        "macro news aggregator",
        '{"preview": true}',
        "Aggregate current macro news into key events, market read, and next-window watch items.",
        ("**📰 Events**", "**🏛 Policy**", "**🛢 Commodities**", "**👁️ Watch Items**"),
        "Missing current news search must return blocked or partial evidence, never fabricated headlines.",
    ),
}


class CmcSkillPromptCatalog:
    @staticmethod
    def list_prompts(args: dict[str, object] | None = None) -> dict[str, object]:
        args = args or {}
        query = str(args.get("query") or "").strip().lower()
        limit = max(1, min(int(args.get("limit") or len(PROMPT_SPECS)), len(PROMPT_SPECS)))
        specs = [
            spec for spec in PROMPT_SPECS.values()
            if not query or query in spec.unique_name or query in spec.display_name.lower()
        ][:limit]
        return {
            "source": "coinmarketcap-skills-marketplace",
            "marketplaceUrl": MARKETPLACE_URL,
            "count": len(specs),
            "prompts": [CmcSkillPromptCatalog.prompt_summary(spec) for spec in specs],
        }

    @staticmethod
    def prompt_for(unique_name: str) -> str:
        spec = PROMPT_SPECS[unique_name]
        return CmcSkillPromptCatalog.build_prompt(spec)

    @staticmethod
    def prompt_summary(spec: CmcSkillPromptSpec) -> dict[str, object]:
        return {
            "uniqueName": spec.unique_name,
            "displayName": spec.display_name,
            "defaultParams": spec.default_params,
            "topics": list(spec.topics),
            "systemPrompt": CmcSkillPromptCatalog.build_prompt(spec),
        }

    @staticmethod
    def build_prompt(spec: CmcSkillPromptSpec) -> str:
        topic_text = ", ".join(spec.topics)
        return f"""
You are OmniAgent's CMC Skill Hub report agent.

## TASK
Invoke a CMC Skill Hub skill and deliver a clean, well-spaced report.

## INPUT
- skill: {spec.unique_name}
- params: {spec.default_params}

## EXECUTION
1. Call find_skill exactly once and confirm unique_name plus input_schema.
2. Validate params against required input_schema fields; if any required field is missing, STOP and return error_code plus reason.
3. Call execute_skill exactly once. Do not retry on failure.
4. Preserve unavailable lanes as missing or partial. Never fabricate market values.

## OUTPUT FORMAT
Target: Telegram markdown. No tables, no HTML. Keep the report under 2500 chars.
Use exactly two sections, **TL;DR** and **Details**, separated by one `———` divider.
In **TL;DR**, write three plain-language sentences, then anomalies, then macro/news context when present.
In **Details**, group findings with these preferred topic headers: {topic_text}.
Every topic must include bullets and a `💡 **Takeaway:**` line.

## SKILL NOTES
- {spec.task}
- Limits: {spec.limits}

## SPACING AND ERROR RULES
- Use `-` for every bullet and put each bullet on its own line.
- Put a blank line before and after lists and bold headers.
- On error, state the exact error_code and reason. STOP.
""".strip()
