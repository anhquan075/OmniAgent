#!/usr/bin/env python3
"""Canary vault cycle: deposit → freeze → unfreeze (requires live Casper keys).

Usage:
  cd backend
  export CASPER_VAULT_CONTRACT_HASH=<hash>
  export CASPER_SECRET_KEY_PATH=~/.casper/secret_key.pem
  export CASPER_ACCOUNT_PUBLIC_KEY=02...
  uv run python scripts/vault_demo_cycle.py

Optional:
  --skip-deposit   only freeze/unfreeze using an existing deposit
  --dry-run        print commands / receipt shapes without submitting
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.settings import get_settings  # noqa: E402
from app.services.casper.hashing import sha256_text  # noqa: E402
from app.services.casper.vault import CasperVaultService  # noqa: E402


def _build_receipt(*, decision_id: str, action: str, risk_score: int = 80) -> str:
    """Build a decision-proof-shaped receipt string for option-B vault gating."""
    now = datetime.now(timezone.utc).isoformat()
    proof_digest = sha256_text(f"vault-demo|{decision_id}|{action}")
    rationale = sha256_text(f"rationale|{decision_id}")
    source = sha256_text(f"source|{decision_id}")
    agent = sha256_text("omniagent-vault-demo")
    guardrail = sha256_text("vault-demo-guardrail")
    return "|".join(
        [
            decision_id,
            action,
            str(risk_score),
            proof_digest,
            rationale,
            source,
            now,
            "approved",
            agent,
            guardrail,
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Collateral vault demo cycle")
    parser.add_argument("--skip-deposit", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--deposit-amount", type=int, default=1_000_000)
    parser.add_argument("--asset-id", default=None)
    args = parser.parse_args()

    settings = get_settings()
    asset_id = args.asset_id or settings.casper_vault_asset_id
    if not args.dry_run and not (
        settings.casper_vault_contract_hash or settings.casper_vault_package_hash
    ):
        print("FAIL: set CASPER_VAULT_CONTRACT_HASH or CASPER_VAULT_PACKAGE_HASH", file=sys.stderr)
        return 2

    results: list[dict[str, object]] = []

    if not args.skip_deposit:
        if args.dry_run:
            results.append(
                {
                    "entryPoint": "deposit",
                    "dryRun": True,
                    "assetId": asset_id,
                    "amount": args.deposit_amount,
                }
            )
        else:
            results.append(
                CasperVaultService.submit_entry(
                    entry_point="deposit",
                    asset_id=asset_id,
                    amount=args.deposit_amount,
                )
            )

    freeze_id = f"vault-demo-freeze-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    freeze_receipt = _build_receipt(decision_id=freeze_id, action="block")
    if args.dry_run:
        results.append(
            {
                "entryPoint": "freeze",
                "dryRun": True,
                "decisionId": freeze_id,
                "receipt": freeze_receipt,
            }
        )
    else:
        results.append(
            CasperVaultService.submit_entry(
                entry_point="freeze",
                asset_id=asset_id,
                decision_id=freeze_id,
                receipt=freeze_receipt,
            )
        )

    unfreeze_id = f"vault-demo-unfreeze-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    unfreeze_receipt = _build_receipt(decision_id=unfreeze_id, action="approve")
    if args.dry_run:
        results.append(
            {
                "entryPoint": "unfreeze",
                "dryRun": True,
                "decisionId": unfreeze_id,
                "receipt": unfreeze_receipt,
            }
        )
    else:
        results.append(
            CasperVaultService.submit_entry(
                entry_point="unfreeze",
                asset_id=asset_id,
                decision_id=unfreeze_id,
                receipt=unfreeze_receipt,
            )
        )

    print(json.dumps({"assetId": asset_id, "results": results}, indent=2))
    if args.dry_run:
        return 0
    failed = [item for item in results if not item.get("submitted")]
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
