from __future__ import annotations

import argparse
import asyncio
from typing import Any

from loguru import logger

from omniagent_api import ApiClient
from script_logging import configure_script_logging


def require_prices(payload: dict[str, Any], symbols: list[str]) -> None:
    prices = payload.get("symbols") if isinstance(payload.get("symbols"), dict) else {}
    missing = [
        symbol
        for symbol in symbols
        if not isinstance(prices.get(symbol), dict) or not prices[symbol].get("priceUsd")
    ]
    if missing:
        raise ValueError(f"missing prices: {', '.join(missing)}")


def preflight_args(tool_name: str | None, strategy: dict[str, Any]) -> dict[str, Any]:
    if not tool_name:
        return {}
    return {
        "cmcAgentHubTool": tool_name,
        "cmcAgentHubArgs": {
            "symbol": strategy.get("symbol") or "BNB",
            "side": strategy.get("side") or "buy",
            "amountUsd": strategy.get("amountUsd") or 1,
        },
    }


async def run(args: argparse.Namespace) -> int:
    client = ApiClient(args.api_url)
    cmc_status = await client.tool("cmc_agent_hub_status", {}, timeout=60)
    if not cmc_status.get("ready"):
        raise RuntimeError(str(cmc_status.get("reason") or "CMC Agent Hub is not ready"))
    recommendation = await client.tool("cmc_agent_hub_recommend_signal_tools", {"limit": 3}, timeout=60)
    prices = await client.tool("cmc_get_price_snapshot", {"symbols": ["BNB", "CAKE", "TWT"]}, timeout=45)
    require_prices(prices, ["BNB"])
    strategy = {"symbol": "BNB", "side": "sell", "amountUsd": 0.25}
    preflight = await client.tool(
        "bnb_live_preflight",
        preflight_args(str(recommendation.get("recommendedToolName") or ""), strategy),
        timeout=90,
    )
    signal = preflight.get("cmcAgentHubSignal") if isinstance(preflight.get("cmcAgentHubSignal"), dict) else {}
    if not signal.get("ready"):
        raise RuntimeError(str(signal.get("reason") or "CMC Agent Hub signal proof is not ready"))
    logger.success("CMC Agent Hub live proof ok via {}", signal.get("toolName"))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Prove live CMC Agent Hub data is wired into preflight.")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    return parser


def main() -> int:
    configure_script_logging()
    return asyncio.run(run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
