#!/usr/bin/env python3
"""Probe Casper x402 paywall: unpaid 402 shape (no network settle without keys).

Usage:
  cd backend && uv run python scripts/settle_x402_casper_once.py
  uv run python scripts/settle_x402_casper_once.py --url https://omniagent-production.up.railway.app
"""

from __future__ import annotations

import argparse
import json
import sys

import httpx


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--url",
        default="http://127.0.0.1:8000",
        help="Backend base URL",
    )
    args = parser.parse_args()
    base = args.url.rstrip("/")
    setup = httpx.get(f"{base}/api/x402/setup", timeout=30)
    print("=== /api/x402/setup ===")
    print(json.dumps(setup.json(), indent=2))
    evidence = httpx.get(f"{base}/api/x402/rwa-evidence", timeout=30)
    print(f"\n=== /api/x402/rwa-evidence → HTTP {evidence.status_code} ===")
    try:
        body = evidence.json()
    except Exception:
        print(evidence.text[:500])
        return 1
    print(json.dumps(body, indent=2)[:2000])
    if evidence.status_code == 402:
        accepts = (body.get("accepts") or [{}])[0]
        network = accepts.get("network")
        if network and not str(network).startswith("casper:"):
            print(f"\nFAIL: expected casper:* network, got {network}", file=sys.stderr)
            return 2
        print("\nOK: Casper 402 price tag emitted.")
        if "PAYMENT-REQUIRED" in evidence.headers:
            print("OK: PAYMENT-REQUIRED header present.")
        return 0
    if evidence.status_code == 503:
        print("\nSetup incomplete (expected until payTo/api key configured).")
        return 0
    print("\nUnexpected status", evidence.status_code, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
