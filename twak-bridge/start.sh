#!/usr/bin/env sh
set -eu

export TWAK_ACCESS_ID="${TWAK_ACCESS_ID:-${TW_ACCESS_ID:-}}"
export TWAK_HMAC_SECRET="${TWAK_HMAC_SECRET:-${TW_HMAC_SECRET:-}}"

if [ -n "${WALLET_PASSWORD:-}" ]; then
  exec twak serve --rest --host 0.0.0.0 --port "${PORT:-8787}" --password "$WALLET_PASSWORD"
fi

exec twak serve --rest --host 0.0.0.0 --port "${PORT:-8787}"
