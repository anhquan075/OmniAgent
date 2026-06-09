from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from live_env import DEFAULT_ENV, parse_env, write_env
from omniagent_api import ApiClient
from script_logging import configure_script_logging, get_script_logger


logger = get_script_logger(__name__)


async def choose_tool(api_url: str) -> str:
    payload = await ApiClient(api_url).tool("cmc_agent_hub_recommend_signal_tools", {"limit": 1}, timeout=60)
    tool_name = str(payload.get("recommendedToolName") or "").strip()
    if not tool_name:
        raise RuntimeError(str(payload.get("reason") or "No CMC signal tool was recommended."))
    return tool_name


async def run(args: argparse.Namespace) -> int:
    tool_name = args.tool or await choose_tool(args.api_url)
    values = parse_env(args.env)
    values["CMC_AGENT_HUB_SIGNAL_TOOL"] = tool_name
    write_env(args.env, values)
    logger.info("cmc_signal_tool_pinned", toolName=tool_name)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Pin the auto-discovered CMC Agent Hub signal tool.")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    parser.add_argument("--env", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--tool", default="")
    return parser


def main() -> int:
    configure_script_logging()
    return asyncio.run(run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
