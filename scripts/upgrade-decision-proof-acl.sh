#!/usr/bin/env bash
# Upgrade the live decision-proof package in place and seed agent ACL.
#
# Required env:
#   CASPER_SECRET_KEY_PATH   path to the installer / agent secret_key.pem
#   AGENT_ACCOUNT_HASH       bare 64-hex or account-hash-… of the authorized agent
#
# Optional env:
#   CASPER_CLIENT_PATH       default: casper-client
#   CASPER_NODE_ADDRESS      default: https://node.testnet.casper.network/rpc
#   CASPER_CHAIN_NAME        default: casper-test
#   CASPER_PAYMENT_AMOUNT_MOTES  default: 2500000000
#   DECISION_PROOF_WASM      default: contracts/casper-decision-proof/wasm/casper-decision-proof.wasm
#
# The installer account must already hold omniagent_decision_proof_access from the
# original install. Re-running seeds authorized_agent once (account marker
# omniagent_decision_proof_acl_seeded) and adds a package version. Existing
# decision_receipts are preserved. Pin the new contract hash into Railway
# CASPER_DECISION_CONTRACT_HASH afterwards; the package hash is stable.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CASPER_CLIENT_PATH="${CASPER_CLIENT_PATH:-casper-client}"
CASPER_NODE_ADDRESS="${CASPER_NODE_ADDRESS:-https://node.testnet.casper.network/rpc}"
CASPER_CHAIN_NAME="${CASPER_CHAIN_NAME:-casper-test}"
CASPER_PAYMENT_AMOUNT_MOTES="${CASPER_PAYMENT_AMOUNT_MOTES:-2500000000}"
DECISION_PROOF_WASM="${DECISION_PROOF_WASM:-$ROOT/contracts/casper-decision-proof/wasm/casper-decision-proof.wasm}"

if [[ -z "${CASPER_SECRET_KEY_PATH:-}" ]]; then
  echo "FAIL: set CASPER_SECRET_KEY_PATH" >&2
  exit 2
fi
if [[ -z "${AGENT_ACCOUNT_HASH:-}" ]]; then
  echo "FAIL: set AGENT_ACCOUNT_HASH (account-hash-… or bare 64-hex of the agent)" >&2
  exit 2
fi
if [[ ! -f "$DECISION_PROOF_WASM" ]]; then
  echo "FAIL: missing $DECISION_PROOF_WASM — run scripts/build-casper-contracts.sh first" >&2
  exit 2
fi

echo "[casper] upgrading decision-proof with agent ACL"
echo "  wasm:   $DECISION_PROOF_WASM ($(wc -c <"$DECISION_PROOF_WASM" | tr -d ' ')B)"
echo "  agent:  $AGENT_ACCOUNT_HASH"
echo "  node:   $CASPER_NODE_ADDRESS"

"$CASPER_CLIENT_PATH" put-deploy \
  --node-address "$CASPER_NODE_ADDRESS" \
  --chain-name "$CASPER_CHAIN_NAME" \
  --secret-key "$CASPER_SECRET_KEY_PATH" \
  --payment-amount "$CASPER_PAYMENT_AMOUNT_MOTES" \
  --session-path "$DECISION_PROOF_WASM" \
  --session-arg "agent_account_hash:string='${AGENT_ACCOUNT_HASH}'"
