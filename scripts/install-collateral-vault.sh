#!/usr/bin/env bash
# Install collateral-vault Wasm on Casper Testnet.
#
# Required env:
#   CASPER_SECRET_KEY_PATH   path to secret_key.pem
#   AGENT_ACCOUNT_HASH       account-hash-... (or bare hex) for install audit key
#
# Optional env:
#   PROOF_CONTRACT_HASH      default: live decision-proof contract hash
#   CASPER_NODE_ADDRESS      default: http://node.testnet.casper.network:7777
#   CASPER_NETWORK           default: casper-test
#   CASPER_PAYMENT_AMOUNT_MOTES  default: 2500000000
#   CASPER_CLIENT_PATH       default: casper-client
#   WASM_PATH                default: contracts/collateral-vault/wasm/collateral-vault.wasm
#
# After success, copy the install deploy hash + resulting contract/package hashes
# into Railway:
#   CASPER_VAULT_CONTRACT_HASH
#   CASPER_VAULT_PACKAGE_HASH
# then canary with: backend/scripts/vault_demo_cycle.py

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_PATH="${WASM_PATH:-$ROOT/contracts/collateral-vault/wasm/collateral-vault.wasm}"
PROOF_CONTRACT_HASH="${PROOF_CONTRACT_HASH:-5a82529f9ba05e716933384ddc9862710ba9a0fd3a7347ab1e8c6e60b1a4c861}"
CASPER_NODE_ADDRESS="${CASPER_NODE_ADDRESS:-http://node.testnet.casper.network:7777}"
CASPER_NETWORK="${CASPER_NETWORK:-casper-test}"
CASPER_PAYMENT_AMOUNT_MOTES="${CASPER_PAYMENT_AMOUNT_MOTES:-2500000000}"
CASPER_CLIENT_PATH="${CASPER_CLIENT_PATH:-casper-client}"

if [[ -z "${CASPER_SECRET_KEY_PATH:-}" ]]; then
  echo "FAIL: set CASPER_SECRET_KEY_PATH" >&2
  exit 2
fi
if [[ -z "${AGENT_ACCOUNT_HASH:-}" ]]; then
  echo "FAIL: set AGENT_ACCOUNT_HASH (account-hash-… of the agent)" >&2
  exit 2
fi
if [[ ! -f "$WASM_PATH" ]]; then
  echo "FAIL: wasm missing at $WASM_PATH" >&2
  exit 2
fi
if ! command -v "$CASPER_CLIENT_PATH" >/dev/null 2>&1; then
  echo "FAIL: $CASPER_CLIENT_PATH not found on PATH" >&2
  exit 2
fi

echo "Installing collateral-vault"
echo "  wasm:   $WASM_PATH"
echo "  proof:  $PROOF_CONTRACT_HASH"
echo "  agent:  $AGENT_ACCOUNT_HASH"
echo "  node:   $CASPER_NODE_ADDRESS"
echo "  chain:  $CASPER_NETWORK"

set -x
"$CASPER_CLIENT_PATH" put-deploy \
  --node-address "$CASPER_NODE_ADDRESS" \
  --chain-name "$CASPER_NETWORK" \
  --secret-key "$CASPER_SECRET_KEY_PATH" \
  --payment-amount "$CASPER_PAYMENT_AMOUNT_MOTES" \
  --session-path "$WASM_PATH" \
  --session-arg "proof_contract_hash:string='${PROOF_CONTRACT_HASH}'" \
  --session-arg "agent_account_hash:string='${AGENT_ACCOUNT_HASH}'"
set +x

echo
echo "Next:"
echo "  1. Open the deploy on https://testnet.cspr.live and copy contract/package hashes"
echo "  2. Set CASPER_VAULT_CONTRACT_HASH / CASPER_VAULT_PACKAGE_HASH on Railway"
echo "  3. Keep CASPER_VAULT_ENFORCE_ENABLED=false until deposit canary succeeds"
echo "  4. Run: cd backend && uv run python scripts/vault_demo_cycle.py"
