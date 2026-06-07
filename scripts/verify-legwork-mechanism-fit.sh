#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== backend lifecycle tests =="
(cd backend && rtk uv run python -m pytest -q \
  tests/test_trade_work_order_lifecycle.py \
  tests/test_proof_score.py \
  tests/test_recovery_candidates.py \
  tests/test_services_oop_contract.py)

echo "== backend compile =="
(cd backend && rtk uv run python -m compileall -q app tests scripts)

echo "== frontend tests and build =="
(cd frontend && rtk pnpm exec vitest run)
(cd frontend && rtk pnpm run build)

if [[ "${RUN_PLAYWRIGHT:-false}" == "true" ]]; then
  echo "== frontend playwright BNB specs =="
  (cd frontend && rtk pnpm exec playwright test \
    e2e/tests/bnb-cockpit-layout.spec.ts \
    e2e/tests/bnb-trading-dashboard.spec.ts \
    --project=chromium)
else
  echo "== frontend playwright BNB specs skipped =="
  echo "Set RUN_PLAYWRIGHT=true to run browser layout specs."
fi

echo "== mechanism drift scan =="
if rg -n \
  "worker marketplace|GPS|EXIF|photo proof|human task|EAS worker attestation|new escrow wallet" \
  README.md docs/bnb-hack*.md backend/app frontend/src scripts \
  -g '!docs/legwork-mechanism-fit.md' \
  -g '!scripts/verify-legwork-mechanism-fit.sh'; then
  echo "Legwork domain drift found outside the allowed mechanism contract." >&2
  exit 1
fi

echo "== secret scan =="
bash scripts/check-secrets.sh

echo "Legwork mechanism fit verified without live trade side effects."
