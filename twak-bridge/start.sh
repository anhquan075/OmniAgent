#!/usr/bin/env bash
set -euo pipefail

export TWAK_ACCESS_ID="${TWAK_ACCESS_ID:-${TW_ACCESS_ID:-}}"
export TWAK_HMAC_SECRET="${TWAK_HMAC_SECRET:-${TW_HMAC_SECRET:-}}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TWAK_BIN="${TWAK_BIN:-$SCRIPT_DIR/node_modules/.bin/twak}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"

if [[ ! -x "$TWAK_BIN" ]]; then
  TWAK_BIN="$(command -v twak || true)"
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "Node.js binary not found. The TWAK bridge image must include Node.js." >&2
  exit 1
fi

if [[ -z "$TWAK_BIN" || ! -x "$TWAK_BIN" ]]; then
  echo "TWAK CLI binary not found. Install bridge dependencies before starting the service." >&2
  exit 1
fi

TWAK_DATA_DIR="${TWAK_DATA_DIR:-$("$NODE_BIN" -e 'const os=require("os"); const path=require("path"); process.stdout.write(path.join(os.homedir(), ".twak"));')}"
TWAK_WALLET_FILE="${TWAK_WALLET_FILE:-$TWAK_DATA_DIR/wallet.json}"

if [[ -n "${TWAK_WALLET_JSON_B64:-}" ]]; then
  mkdir -p "$TWAK_DATA_DIR"
  "$NODE_BIN" -e 'const fs=require("fs"); const file=process.argv[1]; const raw=Buffer.from(process.env.TWAK_WALLET_JSON_B64 || "", "base64").toString("utf8"); JSON.parse(raw); fs.writeFileSync(file, raw.endsWith("\n") ? raw : `${raw}\n`, {mode: 0o600});' "$TWAK_WALLET_FILE"
elif [[ -n "${TWAK_WALLET_JSON:-}" ]]; then
  mkdir -p "$TWAK_DATA_DIR"
  "$NODE_BIN" -e 'const fs=require("fs"); const file=process.argv[1]; const raw=process.env.TWAK_WALLET_JSON || ""; JSON.parse(raw); fs.writeFileSync(file, raw.endsWith("\n") ? raw : `${raw}\n`, {mode: 0o600});' "$TWAK_WALLET_FILE"
fi

if [[ -f "$TWAK_WALLET_FILE" ]]; then
  chmod 600 "$TWAK_WALLET_FILE"
fi

if [[ -n "${WALLET_PASSWORD:-}" ]]; then
  export TWAK_WALLET_PASSWORD="$WALLET_PASSWORD"
fi

if [[ -z "${TWAK_WALLET_PASSWORD:-}" ]]; then
  echo "TWAK_WALLET_PASSWORD or WALLET_PASSWORD must be set to unlock the TWAK bridge wallet." >&2
  exit 1
fi

exec "$TWAK_BIN" serve --rest --host 0.0.0.0 --port "${PORT:-8787}"
