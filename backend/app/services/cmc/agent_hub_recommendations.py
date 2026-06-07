from app.services.cmc.agent_hub import CmcAgentHubClient

KEYWORD_WEIGHTS = {
    "signal": 9,
    "strategy": 8,
    "sentiment": 7,
    "fear": 7,
    "greed": 7,
    "trend": 6,
    "momentum": 6,
    "funding": 6,
    "derivative": 5,
    "onchain": 5,
    "flow": 5,
    "social": 5,
    "news": 5,
    "market": 4,
    "price": 3,
    "quote": 2,
}
ASSET_SCOPE_BONUS = 10
GLOBAL_CONTEXT_PENALTY = 8

class CmcAgentHubRecommendationService:
    @staticmethod
    async def recommend_cmc_agent_hub_signal_tools(limit: int = 8) -> dict[str, object]:
        status = await CmcAgentHubClient.get_cmc_agent_hub_status()
        summaries = status.get("toolSummaries") if isinstance(status.get("toolSummaries"), list) else []
        ranked = sorted(
            (CmcAgentHubRecommendationService.recommendation(row) for row in summaries if isinstance(row, dict)),
            key=lambda row: (-int(row["score"]), str(row["name"])),
        )
        recommendations = [row for row in ranked if int(row["score"]) > 0][:limit]
        reason = status.get("reason")
        if status.get("ready") and not recommendations:
            reason = "CMC Agent Hub returned tools, but no signal-like tools were identified."
        return {
            "source": "coinmarketcap-agent-hub-mcp",
            "configured": bool(status.get("configured")),
            "reachable": bool(status.get("reachable")),
            "ready": bool(status.get("ready")) and bool(recommendations),
            "endpoint": status.get("endpoint"),
            "toolCount": status.get("toolCount"),
            "recommendations": recommendations,
            "recommendedToolName": recommendations[0]["name"] if recommendations else None,
            "recommendedArgs": recommendations[0]["suggestedArgs"] if recommendations else {},
            "reason": None if status.get("ready") and recommendations else reason,
        }

    @staticmethod
    def recommendation(tool: dict[str, object]) -> dict[str, object]:
        name = str(tool.get("name") or "")
        description = str(tool.get("description") or "")
        haystack = f"{name} {description}".lower().replace("_", " ").replace("-", " ")
        score = sum(weight for keyword, weight in KEYWORD_WEIGHTS.items() if keyword in haystack)
        if CmcAgentHubRecommendationService.has_asset_scope(tool):
            score += ASSET_SCOPE_BONUS
        if "global metrics" in haystack or "global market" in haystack:
            score -= GLOBAL_CONTEXT_PENALTY
        return {
            "name": name,
            "description": description,
            "score": score,
            "suggestedArgs": CmcAgentHubRecommendationService.suggested_args(tool),
        }

    @staticmethod
    def suggested_args(tool: dict[str, object]) -> dict[str, object]:
        schema = tool.get("inputSchema") if isinstance(tool.get("inputSchema"), dict) else {}
        properties = schema.get("properties") if isinstance(schema.get("properties"), dict) else {}
        if "symbols" in properties:
            return {"symbols": ["BNB", "CAKE", "TWT"]}
        if "symbol" in properties:
            return {"symbol": "BNB"}
        if "slug" in properties:
            return {"slug": "bnb"}
        if "id" in properties:
            return {"id": "1839"}
        return {}

    @staticmethod
    def has_asset_scope(tool: dict[str, object]) -> bool:
        schema = tool.get("inputSchema") if isinstance(tool.get("inputSchema"), dict) else {}
        properties = schema.get("properties") if isinstance(schema.get("properties"), dict) else {}
        return any(key in properties for key in ("symbols", "symbol", "slug", "id"))
