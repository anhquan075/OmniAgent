from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from pathlib import Path
import sys
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from omniagent_api import ApiClient  # noqa: E402
from script_logging import configure_script_logging, get_script_logger  # noqa: E402


logger = get_script_logger(__name__)


@dataclass
class CheckResult:
    name: str
    ok: bool
    severity: str
    reason: str | None = None


def summarize_preflight(payload: dict[str, Any]) -> list[CheckResult]:
    results: list[CheckResult] = []
    for blocker in payload.get("hardBlockers") or []:
        results.append(CheckResult(str(blocker), False, "error", str(blocker)))
    for warning in payload.get("warnings") or []:
        results.append(CheckResult(str(warning), True, "warn", str(warning)))
    if not results:
        results.append(CheckResult("casper_preflight", True, "ok"))
    return results


async def run(args: argparse.Namespace) -> int:
    client = ApiClient(args.api_url)
    await client.health()
    preflight = await client.tool("casper_live_preflight", {}, timeout=90)
    errors = 0
    warnings = 0
    for result in summarize_preflight(preflight):
        if result.severity == "warn":
            warnings += 1
            logger.warning("readiness_warning", check=result.name, reason=result.reason)
        elif result.ok:
            logger.info("readiness_check_ok", check=result.name)
        else:
            errors += 1
            logger.error("readiness_error", check=result.name, reason=result.reason)
    logger.info("readiness_summary", errors=errors, warnings=warnings)
    return 1 if errors else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Check Casper Testnet agent readiness.")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    return parser


def main() -> int:
    configure_script_logging()
    return asyncio.run(run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
