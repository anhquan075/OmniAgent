from __future__ import annotations

import argparse
import asyncio

from live_cycle_helpers import REAL_TRADE_FLAG, submission_signal, tx_hash_from
from omniagent_api import ApiClient
from script_logging import configure_script_logging, get_script_logger


logger = get_script_logger(__name__)


async def run(args: argparse.Namespace) -> int:
    if not args.i_understand_this_trades_real_bsc_mainnet:
        raise RuntimeError(f"Missing required live-trading flag: {REAL_TRADE_FLAG}")
    client = ApiClient(args.api_url)
    preflight = await client.tool("bnb_live_preflight", {}, timeout=90)
    if not preflight.get("readyForLiveTrade"):
        raise RuntimeError(f"Preflight blocked live trade: {preflight.get('blockers')}")
    result = await client.tool(
        "bnb_run_autonomous_cycle",
        {"execute": True, "amountUsd": args.amount_usd, "slippageBps": args.slippage_bps},
        timeout=180,
    )
    tx_hash = tx_hash_from(result)
    if not tx_hash:
        raise RuntimeError("Live cycle did not return a BSC tx hash.")
    status = await client.tool("bnb_get_trade_status", {"txHash": tx_hash}, timeout=90)
    signal = submission_signal(result, status)
    logger.info("bsc_trade_submitted", txHash=tx_hash)
    logger.info(
        "cmc_signal_submission",
        cmcTool=signal.get("toolName"),
        cmcVerified=signal.get("serverVerified"),
    )
    logger.info("receipt_status", status=status.get("status"))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Submit one guarded autonomous BSC trade.")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    parser.add_argument("--amount-usd", type=float, default=0.25)
    parser.add_argument("--slippage-bps", type=int, default=50)
    parser.add_argument(REAL_TRADE_FLAG, action="store_true")
    return parser


def main() -> int:
    configure_script_logging()
    return asyncio.run(run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
