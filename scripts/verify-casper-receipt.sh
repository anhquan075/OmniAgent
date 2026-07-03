#!/usr/bin/env bash
set -euo pipefail

# verify-casper-receipt.sh — independently verify a decision receipt on Casper Testnet.
# Usage: scripts/verify-casper-receipt.sh <decision_id> [--use-rpc] [--api-url <url>] [--contract-hash <hash>] [--node-address <url>] [--expected-account <public-key>] [--expected-contract-hash <hash>] [--expected-package-hash <hash>]
# No secrets required. Uses the dashboard API for the local receipt and public Casper RPC read-only.

DECISION_ID=""
CONTRACT_HASH="${CASPER_DECISION_CONTRACT_HASH:-}"
NODE_ADDRESS="${CASPER_NODE_ADDRESS:-https://node.testnet.casper.network/rpc}"
API_URL="${OMNIAGENT_API_URL:-http://127.0.0.1:8000}"
SESSION_JAR="${TMPDIR:-/tmp}/omniagent-casper-receipt-session-$$.cookies"
RECEIPTS_JSON="${TMPDIR:-/tmp}/omniagent-casper-receipts-$$.json"
PUBLIC_PROOF_JSON="${TMPDIR:-/tmp}/omniagent-casper-public-proof-$$.json"
USE_RPC=false
EXPECTED_ACCOUNT=""
EXPECTED_CONTRACT_HASH=""
EXPECTED_PACKAGE_HASH=""

cleanup() {
  rm -f "${SESSION_JAR}" "${RECEIPTS_JSON}" "${PUBLIC_PROOF_JSON}"
}
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --contract-hash) CONTRACT_HASH="$2"; shift 2 ;;
    --node-address)  NODE_ADDRESS="$2";  shift 2 ;;
    --api-url)       API_URL="$2";       shift 2 ;;
    --expected-account) EXPECTED_ACCOUNT="$2"; shift 2 ;;
    --expected-contract-hash) EXPECTED_CONTRACT_HASH="$2"; shift 2 ;;
    --expected-package-hash) EXPECTED_PACKAGE_HASH="$2"; shift 2 ;;
    --ledger-path)   echo "--ledger-path is deprecated; using dashboard API receipts." >&2; shift 2 ;;
    --use-rpc)       USE_RPC=true;       shift ;;
    -*) echo "Unknown flag: $1" >&2; exit 2 ;;
    *) DECISION_ID="$1"; shift ;;
  esac
done

if [[ -z "$DECISION_ID" ]]; then
  echo "Usage: $0 <decision_id> [--use-rpc] [--api-url <url>] [--contract-hash <hash>] [--node-address <url>] [--expected-account <public-key>] [--expected-contract-hash <hash>] [--expected-package-hash <hash>]"
  exit 2
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "CURL_MISSING: curl not on PATH"
  exit 3
fi

if [[ "$USE_RPC" == "false" ]] && ! command -v casper-client >/dev/null 2>&1; then
  echo "CASPER_CLIENT_MISSING: casper-client not on PATH"
  exit 3
fi

if [[ -z "$CONTRACT_HASH" ]]; then
  echo "CONTRACT_HASH_MISSING: set CASPER_DECISION_CONTRACT_HASH or pass --contract-hash"
  exit 3
fi

API_BASE="${API_URL%/}"
curl -fsS -c "${SESSION_JAR}" "${API_BASE}/api/session" >/dev/null || {
  echo "API_SESSION_MISSING: unable to initialize dashboard API session at ${API_BASE}"
  exit 4
}
curl -fsS -b "${SESSION_JAR}" "${API_BASE}/api/dashboard/receipts?limit=50" -o "${RECEIPTS_JSON}" || {
  echo "NOT_FOUND_LOCAL: dashboard receipts unavailable at ${API_BASE}"
  exit 4
}

if [[ -n "$EXPECTED_ACCOUNT$EXPECTED_CONTRACT_HASH$EXPECTED_PACKAGE_HASH" ]]; then
  curl -fsS "${API_BASE}/api/public/proof" -o "${PUBLIC_PROOF_JSON}" || {
    echo "PUBLIC_PROOF_UNAVAILABLE: public proof unavailable at ${API_BASE}/api/public/proof"
    exit 4
  }
  rtk node -e '
const fs = require("fs");
const [file, account, contractHash, packageHash] = process.argv.slice(1);
const proof = JSON.parse(fs.readFileSync(file, "utf8"));
const normalizeHash = (value) => String(value || "").replace(/^hash-/, "");
const checks = [
  ["ACCOUNT_MISMATCH", account, proof.accountPublicKey, (a, b) => String(a) === String(b)],
  ["CONTRACT_HASH_MISMATCH", contractHash, proof.contractHash, (a, b) => normalizeHash(a) === normalizeHash(b)],
  ["PACKAGE_HASH_MISMATCH", packageHash, proof.contractPackageHash, (a, b) => normalizeHash(a) === normalizeHash(b)],
];
for (const [code, expected, observed, matches] of checks) {
  if (expected && !matches(expected, observed)) {
    console.error(`${code}: expected ${expected}, observed ${observed || "missing"}`);
    process.exit(1);
  }
}
' "${PUBLIC_PROOF_JSON}" "${EXPECTED_ACCOUNT}" "${EXPECTED_CONTRACT_HASH}" "${EXPECTED_PACKAGE_HASH}" || exit 4
fi

LOCAL_RECEIPT=$(rtk node -e '
const fs = require("fs");
const [file, decisionId] = process.argv.slice(1);
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const receipt = (data.receipts || []).find((item) => item.decisionId === decisionId);
if (!receipt) process.exit(4);
const fallback = [
  receipt.decisionId,
  receipt.action,
  receipt.riskScore,
  receipt.proofDigest,
  receipt.rationaleHash,
  receipt.sourceHash,
  receipt.timestamp,
  receipt.policyGate,
  receipt.agentAccountHash,
  receipt.guardrailHash,
].map((item) => item ?? "").join("|");
process.stdout.write(String(receipt.receiptValue || fallback));
' "${RECEIPTS_JSON}" "${DECISION_ID}" 2>/dev/null) || {
  echo "NOT_FOUND_LOCAL: decision '${DECISION_ID}' not in dashboard receipts"
  exit 4
}

echo "Local receipt:  ${LOCAL_RECEIPT:0:80}..."

QUERY_KEY="$CONTRACT_HASH"
[[ "$QUERY_KEY" != hash-* ]] && QUERY_KEY="hash-${QUERY_KEY}"

if [[ "$USE_RPC" == "true" ]]; then
  STATE_ROOT=$(curl -s -X POST "$NODE_ADDRESS" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"chain_get_state_root_hash","params":[],"id":1}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('result',{}).get('state_root_hash',''))" 2>/dev/null) || true
else
  STATE_ROOT=$(casper-client get-state-root-hash --node-address "$NODE_ADDRESS" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('state_root_hash',''))" 2>/dev/null) || true
fi

if [[ -z "$STATE_ROOT" ]]; then
  echo "STATE_ROOT_MISSING: unable to get state root hash from ${NODE_ADDRESS}"
  exit 5
fi

echo "State root:     ${STATE_ROOT:0:32}..."

if [[ "$USE_RPC" == "true" ]]; then
  DICTIONARY_PAYLOAD=$(python3 -c "
import json, sys
state_root, query_key, decision_id = sys.argv[1:4]
print(json.dumps({
    'jsonrpc': '2.0',
    'method': 'state_get_dictionary_item',
    'params': {
        'state_root_hash': state_root,
        'dictionary_identifier': {
            'ContractNamedKey': {
                'key': query_key,
                'dictionary_name': 'decision_receipts',
                'dictionary_item_key': decision_id,
            }
        },
    },
    'id': 2,
}))
" "$STATE_ROOT" "$QUERY_KEY" "$DECISION_ID")
  CHAIN_RECEIPT=$(curl -s -X POST "$NODE_ADDRESS" \
    -H "Content-Type: application/json" \
    -d "$DICTIONARY_PAYLOAD") || {
    echo "NOT_FOUND_CHAIN: unable to query dictionary item for '${DECISION_ID}'"
    exit 5
  }
else
  CHAIN_RECEIPT=$(casper-client get-dictionary-item \
    --node-address "$NODE_ADDRESS" \
    --state-root-hash "$STATE_ROOT" \
    --contract-hash "$QUERY_KEY" \
    --dictionary-name decision_receipts \
    --dictionary-item-key "$DECISION_ID" 2>/dev/null) || {
    echo "NOT_FOUND_CHAIN: unable to query dictionary item for '${DECISION_ID}'"
    exit 5
  }
fi

CHAIN_PARSED=$(echo "$CHAIN_RECEIPT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    cl = data.get('stored_value', {}).get('CLValue', {})
    if not cl:
        cl = data.get('result', {}).get('stored_value', {}).get('CLValue', {})
    parsed = cl.get('parsed', '')
    if parsed:
        print(parsed)
    else:
        print(cl.get('bytes', ''))
except: print('')
" 2>/dev/null) || true

echo "Chain receipt:  ${CHAIN_PARSED:0:80}..."

if [[ "$LOCAL_RECEIPT" == "$CHAIN_PARSED" ]]; then
  echo ""
  echo "VERIFIED: decision '${DECISION_ID}' receipt matches on-chain record"
  exit 0
else
  echo ""
  echo "MISMATCH: local receipt does not match on-chain record"
  exit 1
fi
