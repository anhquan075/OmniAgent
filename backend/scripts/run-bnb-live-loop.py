from __future__ import annotations

import argparse
import asyncio
from typing import Any

from loguru import logger

from live_cycle_helpers import REAL_TRADE_FLAG, submission_signal, tx_hash_from
from omniagent_api import ApiClient
from script_logging import configure_script_logging


async def run_cycle(client: ApiClient, amount_usd: float, slippage_bps: int) -> tuple[str, dict[str, Any]]:
    preflight = await client.tool("bnb_live_preflight", {}, timeout=90)
    if not preflight.get("readyForLiveTrade"):
        raise RuntimeError(f"Preflight blocked live trade: {preflight.get('blockers')}")
    result = await client.tool(
        "bnb_run_autonomous_cycle",
        {"execute": True, "amountUsd": amount_usd, "slippageBps": slippage_bps},
        timeout=180,
    )
    tx_hash = tx_hash_from(result)
    if not tx_hash:
        raise RuntimeError("Live loop cycle did not return a BSC tx hash.")
    status = await client.tool("bnb_get_trade_status", {"txHash": tx_hash}, timeout=90)
    return tx_hash, {"result": result, "status": status, "signal": submission_signal(result, status)}


async def run(args: argparse.Namespace) -> int:
    if not args.i_understand_this_trades_real_bsc_mainnet:
        raise RuntimeError(f"Missing required live-trading flag: {REAL_TRADE_FLAG}")
    client = ApiClient(args.api_url)
    for index in range(args.max_cycles):
        tx_hash, payload = await run_cycle(client, args.amount_usd, args.slippage_bps)
        signal = payload["signal"]
        logger.success("cycle {}/{} submitted {}", index + 1, args.max_cycles, tx_hash)
        logger.info("cmcTool={} cmcVerified={}", signal.get("toolName"), signal.get("serverVerified"))
        if index + 1 < args.max_cycles:
            await asyncio.sleep(args.interval_seconds)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run repeated guarded autonomous BSC trade cycles.")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    parser.add_argument("--max-cycles", type=int, default=7)
    parser.add_argument("--interval-seconds", type=int, default=86_400)
    parser.add_argument("--amount-usd", type=float, default=0.25)
    parser.add_argument("--slippage-bps", type=int, default=50)
    parser.add_argument(REAL_TRADE_FLAG, action="store_true")
    return parser


def main() -> int:
    configure_script_logging()
    return asyncio.run(run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
