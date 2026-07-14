#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if rg -n \
  "(sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|TW_HMAC_SECRET=.*[^[:space:]]|PRIVATE_KEY=0x[0-9a-fA-F]{64})" \
  . \
  -g '!*node_modules*' \
  -g '!frontend/dist/**' \
  -g '!playwright-report/**' \
  -g '!test-results/**' \
  -g '!scripts/check-secrets.sh' \
  -g '!RAILWAY.md' \
  -g '!backend/.env.example' \
  -g '!frontend/.env.example'; then
  echo "Potential secret material found." >&2
  exit 1
fi

echo "No obvious secrets found."
