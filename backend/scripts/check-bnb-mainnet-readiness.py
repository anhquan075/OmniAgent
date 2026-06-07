from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from typing import Any

from loguru import logger

from omniagent_api import ApiClient
from script_logging import configure_script_logging


@dataclass
class CheckResult:
    name: str
    ok: bool
    severity: str
    reason: str | None = None


def preflight_signal_check(payload: dict[str, Any] | None, live: bool) -> CheckResult:
    ready = bool((payload or {}).get("ready"))
    if ready:
        return CheckResult("cmc_agent_hub_signal", True, "ok")
    return CheckResult(
        "cmc_agent_hub_signal",
        not live,
        "error" if live else "warn",
        str((payload or {}).get("reason") or "CMC Agent Hub signal tool has not been verified."),
    )


def summarize_preflight(payload: dict[str, Any], live: bool) -> list[CheckResult]:
    results = [preflight_signal_check(as_dict(payload.get("cmcAgentHubSignal")), live)]
    for blocker in payload.get("blockers") or []:
        if isinstance(blocker, dict):
            error = bool(blocker.get("requiredForLiveTrade")) if live else bool(blocker.get("requiredBeforeEnable"))
            results.append(
                CheckResult(
                    str(blocker.get("name") or "unknown"),
                    False,
                    "error" if error else "warn",
                    str(blocker.get("reason") or "blocked"),
                )
            )
    if not results:
        results.append(CheckResult("preflight", True, "ok"))
    return dedupe_results(results)


def as_dict(value: object) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def dedupe_results(results: list[CheckResult]) -> list[CheckResult]:
    seen: set[str] = set()
    output: list[CheckResult] = []
    for result in results:
        key = f"{result.name}:{result.severity}:{result.reason}"
        if key not in seen:
            seen.add(key)
            output.append(result)
    return output


async def run(args: argparse.Namespace) -> int:
    client = ApiClient(args.api_url)
    await client.health()
    preflight = await client.tool("bnb_live_preflight", {}, timeout=90)
    errors = 0
    warnings = 0
    for result in summarize_preflight(preflight, live=args.live):
        if result.severity == "warn":
            warnings += 1
            logger.warning("{}: {}", result.name, result.reason)
        elif result.ok:
            logger.success("{} ok", result.name)
        elif result.severity == "error":
            errors += 1
            logger.error("{}: {}", result.name, result.reason)
    logger.info("readiness summary: {} errors, {} warnings", errors, warnings)
    return 1 if errors else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Check BNB mainnet agent readiness.")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    parser.add_argument("--live", action="store_true", help="Treat live-only blockers as errors.")
    return parser


def main() -> int:
    configure_script_logging()
    return asyncio.run(run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
