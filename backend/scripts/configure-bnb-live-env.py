from __future__ import annotations

import argparse
import os
from pathlib import Path

from live_env import DEFAULT_ENV, parse_env, write_env
from script_logging import configure_script_logging, get_script_logger


logger = get_script_logger(__name__)


CMC_KEYS = (
    "CMC_AGENT_HUB_API_KEY",
    "CMC_MCP_API_KEY",
    "CMC_PRO_API_KEY",
    "COINMARKETCAP_API_KEY",
    "X_CMC_PRO_API_KEY",
)


def has_cmc_key(values: dict[str, str]) -> bool:
    return any(values.get(key) or os.getenv(key) for key in CMC_KEYS)


def apply_live_flags(path: Path, enable: bool) -> None:
    values = parse_env(path)
    if enable and not has_cmc_key(values):
        raise RuntimeError("Refusing to enable live trading without a CMC Agent Hub key.")
    values["BNB_TRADING_ENABLED"] = "true" if enable else "false"
    values["ALLOW_AGENT_RUN"] = "true" if enable else "false"
    values.setdefault("TRUST_WALLET_AGENT_KIT_MODE", "rest")
    values.setdefault("BNB_AGENT_SDK_ENABLED", "true")
    values.setdefault("TRADE_LEDGER_PATH", "backend/data/trade-ledger.jsonl")
    for key in CMC_KEYS:
        if os.getenv(key) and key not in values:
            values[key] = os.environ[key]
    write_env(path, values)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Toggle guarded BNB live-trading flags.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--enable-live", action="store_true")
    group.add_argument("--disable-live", action="store_true")
    parser.add_argument("--env", type=Path, default=DEFAULT_ENV)
    return parser


def main() -> int:
    configure_script_logging()
    args = build_parser().parse_args()
    apply_live_flags(args.env, enable=bool(args.enable_live))
    logger.info(
        "live_env_updated",
        env=str(args.env),
        liveTrading="enabled" if args.enable_live else "disabled",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
