#!/usr/bin/env python3
"""Seed Cheat Lab canaries: submit three intentional vault reverts on Testnet.

Usage:
  cd backend
  export CASPER_VAULT_CONTRACT_HASH=<hash>
  export CASPER_SECRET_KEY_PATH=~/.casper/secret_key.pem
  uv run python scripts/cheat_lab_seed.py
  uv run python scripts/cheat_lab_seed.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.casper.cheat_lab import CasperCheatLabService  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed OmniAgent Cheat Lab canaries")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    result = CasperCheatLabService.seed_all(dry_run=args.dry_run)
    print(json.dumps(result, indent=2))
    if args.dry_run:
        return 0
    failed = [item for item in result["results"] if not item.get("ok")]
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
