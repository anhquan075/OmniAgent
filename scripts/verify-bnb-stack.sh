#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== backend tests =="
(cd backend && rtk uv run python -m pytest -q)

echo "== backend compile =="
(cd backend && rtk uv run python -m compileall -q app tests scripts)

echo "== frontend build =="
(cd frontend && rtk pnpm run build)

echo "== BNB readiness dry check =="
(cd backend && rtk uv run python scripts/check-bnb-mainnet-readiness.py)

echo "== CMC Skill Hub daily overview smoke =="
(cd backend && rtk uv run python scripts/smoke-cmc-skill-hub.py)

echo "BNB stack verified in dry-run mode."
