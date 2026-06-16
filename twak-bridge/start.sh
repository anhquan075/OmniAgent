#!/usr/bin/env bash
set -euo pipefail

export TWAK_ACCESS_ID="${TWAK_ACCESS_ID:-${TW_ACCESS_ID:-}}"
export TWAK_HMAC_SECRET="${TWAK_HMAC_SECRET:-${TW_HMAC_SECRET:-}}"

if [[ -n "${WALLET_PASSWORD:-}" ]]; then
  export TWAK_WALLET_PASSWORD="$WALLET_PASSWORD"
fi

if [[ -z "${TWAK_WALLET_PASSWORD:-}" ]]; then
  echo "WALLET_PASSWORD or TWAK_WALLET_PASSWORD must be set to unlock the TWAK bridge wallet." >&2
  exit 1
fi

exec twak serve --rest --host 0.0.0.0 --port "${PORT:-8787}"
