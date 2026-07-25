#!/usr/bin/env python3
"""Seal an on-chain blocked decision + vault enforce revert for Desk Story.

Requires live Casper keys and the blocked-receipt contract upgrade.

Usage (from repo root):
  cd backend && \\
    OMNIAGENT_SKIP_ENV_FILE=true \\
    uv run python scripts/seed_blocked_receipt_canary.py
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.settings import get_settings  # noqa: E402
from app.services.casper.submitter import CasperCliSubmitter  # noqa: E402
from app.services.casper.contract import CasperDecisionContractService  # noqa: E402
from app.services.casper.hashing import sha256_text  # noqa: E402
from app.services.casper.vault import CasperVaultService  # noqa: E402


def main() -> int:
    settings = get_settings()
    decision_id = f"desk-reject-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    dissent = sha256_text(f"proposed|blocked|blocked|{decision_id}")
    result = CasperDecisionContractService.record_decision(
        {
            "decisionId": decision_id,
            "action": "block",
            "riskScore": 92,
            "rationale": "Desk Story: critic dissented; policy gate blocked financeability.",
            "policyGate": "blocked",
            "proposerVerdict": "proposed",
            "criticVerdict": "blocked",
            "dissentDigest": dissent,
            "guardrailHash": sha256_text("desk-story-reject"),
            "sourceHash": "sha256:desk-story-source",
            "submit": True,
            "iUnderstandThisSubmitsCasperTestnet": True,
        }
    )
    print(json.dumps({"record": {
        "status": result.get("status"),
        "submitted": result.get("submitted"),
        "hardBlockers": result.get("hardBlockers"),
        "transactionHash": result.get("transactionHash"),
        "decisionId": decision_id,
        "dissentDigest": dissent,
    }}, indent=2))
    if not result.get("submitted"):
        return 1

    tx_hash = str(result.get("transactionHash") or "")
    for _ in range(24):
        poll = CasperCliSubmitter.get_transaction_status(tx_hash)
        if poll.get("status") in {"confirmed", "failed"}:
            print(json.dumps({"recordPoll": poll}, indent=2))
            if poll.get("status") != "confirmed":
                return 1
            break
        time.sleep(5)
    else:
        print(json.dumps({"recordPoll": "timeout"}, indent=2))
        return 1

    # Build a vault call that tries to freeze from the blocked on-chain receipt.
    receipt = (
        result.get("decision", {}).get("decisionReceipt", {}).get("receiptValue")
        if isinstance(result.get("decision"), dict)
        else None
    )
    if not receipt:
        from app.services.casper.receipt import CasperDecisionReceiptService

        receipt = CasperDecisionReceiptService.receipt_from_decision(result["decision"]).get(
            "receiptValue"
        )

    enforce = CasperVaultService.submit_entry(
        entry_point="freeze",
        asset_id=settings.casper_vault_asset_id or "rwa-demo-collateral-001",
        decision_id=decision_id,
        receipt=str(receipt),
        ltv_bps=5000,
        verified=True,
    )
    print(json.dumps({"enforceAttempt": {
        "submitted": enforce.get("submitted"),
        "transactionHash": enforce.get("transactionHash"),
        "hardBlockers": enforce.get("hardBlockers"),
        "explorerUrl": enforce.get("explorerUrl"),
    }}, indent=2))
    if not enforce.get("submitted"):
        return 1

    enforce_tx = str(enforce.get("transactionHash") or "")
    for _ in range(24):
        poll = CasperCliSubmitter.get_transaction_status(enforce_tx)
        if poll.get("status") in {"confirmed", "failed"}:
            print(json.dumps({
                "enforcePoll": poll,
                "expected": "failed with User 102",
                "pins": {
                    "CASPER_DECISION_BLOCKED_CANARY_TX_HASH": tx_hash,
                    "CASPER_DECISION_BLOCKED_DECISION_ID": decision_id,
                    "CASPER_DECISION_BLOCKED_ENFORCE_REVERT_TX_HASH": enforce_tx,
                },
            }, indent=2))
            return 0 if poll.get("status") == "failed" else 1
        time.sleep(5)
    print(json.dumps({"enforcePoll": "timeout"}, indent=2))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
