#!/usr/bin/env bash
set -euo pipefail

export TWAK_ACCESS_ID="${TWAK_ACCESS_ID:-${TW_ACCESS_ID:-}}"
export TWAK_HMAC_SECRET="${TWAK_HMAC_SECRET:-${TW_HMAC_SECRET:-}}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TWAK_BIN="${TWAK_BIN:-$SCRIPT_DIR/node_modules/.bin/twak}"

if [[ ! -x "$TWAK_BIN" ]]; then
  TWAK_BIN="$(command -v twak || true)"
fi

if [[ -z "$TWAK_BIN" || ! -x "$TWAK_BIN" ]]; then
  echo "TWAK CLI binary not found. Install bridge dependencies before starting the service." >&2
  exit 1
fi

if [[ -n "${WALLET_PASSWORD:-}" ]]; then
  export TWAK_WALLET_PASSWORD="$WALLET_PASSWORD"
fi

if [[ -z "${TWAK_WALLET_PASSWORD:-}" ]]; then
  echo "WALLET_PASSWORD or TWAK_WALLET_PASSWORD must be set to unlock the TWAK bridge wallet." >&2
  exit 1
fi

exec "$TWAK_BIN" serve --rest --host 0.0.0.0 --port "${PORT:-8787}"
