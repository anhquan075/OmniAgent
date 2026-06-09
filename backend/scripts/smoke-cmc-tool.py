from __future__ import annotations

import argparse
import asyncio

from omniagent_api import ApiClient
from script_logging import configure_script_logging, get_script_logger


logger = get_script_logger(__name__)


async def run(args: argparse.Namespace) -> int:
    client = ApiClient(args.api_url)
    status = await client.tool("cmc_agent_hub_status", {}, timeout=60)
    if not status.get("ready"):
        raise RuntimeError(str(status.get("reason") or "CMC Agent Hub is not ready"))
    prices = await client.tool("cmc_get_price_snapshot", {"symbols": ["BNB", "CAKE", "TWT"]}, timeout=45)
    symbols = prices.get("symbols") if isinstance(prices.get("symbols"), dict) else {}
    if not any(isinstance(item, dict) and item.get("priceUsd") for item in symbols.values()):
        raise RuntimeError("CMC price snapshot returned no prices.")
    logger.info("cmc_agent_hub_smoke_ok")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Smoke test CMC Agent Hub status and price data.")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    return parser


def main() -> int:
    configure_script_logging()
    return asyncio.run(run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
