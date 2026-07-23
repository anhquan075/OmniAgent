#!/usr/bin/env python3
"""Probe (default) or document the live Casper x402 settle path.

Probe only (no buyer key):
  cd backend && uv run python scripts/settle_x402_casper_once.py
  uv run python scripts/settle_x402_casper_once.py --url https://omniyield.app

Live settle (buyer PEM + WCSPR/CasCet balance) uses the Node helper:
  cd backend
  npm install @make-software/casper-x402 casper-js-sdk
  CLIENT_PRIVATE_KEY_PATH=/path/to/secret_key.pem \\
    node scripts/settle_x402_casper_live.mjs

Optional direct facilitator settle (bypasses OmniAgent route):
  DIRECT_FACILITATOR=1 CASPER_X402_FACILITATOR_API_KEY=... \\
    CLIENT_PRIVATE_KEY_PATH=... node scripts/settle_x402_casper_live.mjs

After success, paste the cspr.live deploy URL into docs/dorahacks-finals-description.md
row 6 and set CASPER_X402_RECEIPT on Railway with public-safe Casper fields.
"""

from __future__ import annotations

import argparse
import json
import sys

import httpx


def _normalize_asset(asset: str) -> str:
    value = str(asset or "").strip()
    if value.startswith("hash-"):
        value = value[5:]
    if value.startswith("0x"):
        value = value[2:]
    return value.lower()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--url",
        default="https://omniyield.app",
        help="Backend base URL (prefer omniyield.app; raw Railway may be WAF-blocked)",
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
        asset = _normalize_asset(str(accepts.get("asset") or ""))
        if network and not str(network).startswith("casper:"):
            print(f"\nFAIL: expected casper:* network, got {network}", file=sys.stderr)
            return 2
        if str(accepts.get("asset") or "").startswith("hash-") or len(asset) != 64:
            print(
                "\nWARN: asset should be bare 64-hex for facilitator "
                f"(got {accepts.get('asset')!r}). Deploy asset-normalization fix "
                "or set CASPER_X402_ASSET without hash- prefix.",
                file=sys.stderr,
            )
        print("\nOK: Casper 402 price tag emitted.")
        if "PAYMENT-REQUIRED" in evidence.headers:
            print("OK: PAYMENT-REQUIRED header present.")
        print(
            "\nNext: fund a buyer with CasCet/WCSPR, then run "
            "scripts/settle_x402_casper_live.mjs (see module docstring)."
        )
        return 0
    if evidence.status_code == 503:
        print("\nSetup incomplete (expected until payTo/api key configured).")
        return 0
    print("\nUnexpected status", evidence.status_code, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
