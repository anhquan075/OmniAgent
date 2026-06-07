from __future__ import annotations

import argparse
import asyncio
import json
from typing import Any

from loguru import logger

from omniagent_api import ApiClient
from script_logging import configure_script_logging


async def run(args: argparse.Namespace) -> int:
    client = ApiClient(args.api_url)
    status = await client.tool("cmc_skill_hub_status", {}, timeout=60)
    if not status.get("ready"):
        raise RuntimeError(str(status.get("reason") or "CMC Skill Hub is not ready"))
    found = await client.tool("cmc_skill_hub_find_skill", {"query": "btc price"}, timeout=60)
    candidates = skill_candidates(found)
    if not candidates:
        raise RuntimeError("find_skill returned no candidates.")
    if args.execute_preview:
        preview = await client.tool(
            "cmc_skill_hub_execute_skill",
            {"uniqueName": "btc_cross_asset_correlation", "parameters": {"preview": True}},
            timeout=300,
        )
        if preview.get("ok") is False or preview.get("status") == "error":
            raise RuntimeError(f"execute_skill preview failed: {preview}")
    logger.success("CMC Skill Hub smoke ok")
    return 0


def skill_candidates(payload: dict[str, Any]) -> list[Any]:
    direct = payload.get("candidates") or payload.get("skills")
    if isinstance(direct, list):
        return direct
    parsed = payload.get("parsedContent")
    if isinstance(parsed, list):
        return parsed
    result = payload.get("result") if isinstance(payload.get("result"), dict) else {}
    for item in result.get("content") or []:
        if not isinstance(item, dict) or item.get("type") != "text":
            continue
        text = item.get("text")
        if not isinstance(text, str):
            continue
        try:
            nested = json.loads(text)
        except json.JSONDecodeError:
            continue
        candidates = nested.get("candidates") if isinstance(nested, dict) else None
        if isinstance(candidates, list):
            return candidates
    return []


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Smoke test CMC Skill Hub through FastAPI MCP.")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    parser.add_argument("--execute-preview", action="store_true")
    return parser


def main() -> int:
    configure_script_logging()
    return asyncio.run(run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
