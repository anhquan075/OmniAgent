from __future__ import annotations

import argparse
import asyncio
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from omniagent_api import ApiClient  # noqa: E402
from script_logging import configure_script_logging, get_script_logger  # noqa: E402


LIVE_CASPER_FLAG = "--i-understand-this-submits-casper-testnet"
logger = get_script_logger(__name__)


async def run(args: argparse.Namespace) -> int:
    submit = not args.dry_run
    if submit and not args.i_understand_this_submits_casper_testnet:
        raise RuntimeError(f"Missing required Casper submit flag: {LIVE_CASPER_FLAG}")
    client = ApiClient(args.api_url, operator_token=getattr(args, "operator_token", None))
    await client.health()
    preflight = await client.tool("casper_live_preflight", {}, timeout=90)
    blockers = preflight.get("hardBlockers") or []
    if submit and blockers:
        raise RuntimeError(f"Casper preflight blocked live submit: {blockers}")
    cycle_args: dict[str, object] = {
        "decisionId": args.decision_id,
        "submit": submit,
        "iUnderstandThisSubmitsCasperTestnet": args.i_understand_this_submits_casper_testnet,
    }
    if args.action:
        cycle_args["action"] = args.action
    if args.rationale:
        cycle_args["rationale"] = args.rationale
    result = await client.tool("casper_run_autonomous_cycle", cycle_args, timeout=180)
    logger.info(
        "casper_decision_cycle",
        status=result.get("status"),
        submitted=result.get("submitted"),
        blockers=result.get("hardBlockers"),
        deployHash=result.get("deployHash"),
        scenario=(result.get("cycle") or {}).get("evidence", {}).get("scenario"),
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run one guarded Casper RWA collateral decision cycle.")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    parser.add_argument("--dry-run", action="store_true", help="Build payload without live submit.")
    parser.add_argument("--decision-id", default="rwa-collateral-demo-001")
    parser.add_argument("--action", default="", help="Override action (default: evidence-derived).")
    parser.add_argument("--rationale", default="", help="Override rationale (default: evidence-derived).")
    parser.add_argument("--operator-token", default=None)
    parser.add_argument(LIVE_CASPER_FLAG, action="store_true")
    return parser


def main() -> int:
    configure_script_logging()
    return asyncio.run(run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
