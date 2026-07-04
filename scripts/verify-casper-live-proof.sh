#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROOF_FILE="${PROOF_FILE:-}"
CASPER_CLIENT="${CASPER_CLIENT_PATH:-casper-client}"
NODE_ADDRESS="${CASPER_NODE_ADDRESS:-${CASPER_RPC_URL:-https://node.testnet.casper.network/rpc}}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

usage() {
  cat <<'USAGE'
Usage: scripts/verify-casper-live-proof.sh [options]

Required values can be provided as environment variables or options:
  CASPER_CONTRACT_INSTALL_DEPLOY_HASH  --install-deploy-hash
  CASPER_DECISION_DEPLOY_HASH          --decision-deploy-hash
  CASPER_DECISION_CONTRACT_HASH        --contract-hash
  CASPER_PROOF_DIGEST                  --proof-digest
  CASPER_DECISION_ID                   --decision-id
  CASPER_DECISION_RECEIPT              --decision-receipt

Optional:
  --proof-file <path>  Read the same fields from a local JSON file.

Recommended proof file:
  proofs/casper-buildathon-submission-proof.json
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --proof-file) PROOF_FILE="$2"; shift 2 ;;
    --install-deploy-hash) CASPER_CONTRACT_INSTALL_DEPLOY_HASH="$2"; shift 2 ;;
    --decision-deploy-hash) CASPER_DECISION_DEPLOY_HASH="$2"; shift 2 ;;
    --contract-hash) CASPER_DECISION_CONTRACT_HASH="$2"; shift 2 ;;
    --proof-digest) CASPER_PROOF_DIGEST="$2"; shift 2 ;;
    --decision-id) CASPER_DECISION_ID="$2"; shift 2 ;;
    --decision-receipt) CASPER_DECISION_RECEIPT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

node_extract() {
  rtk node -e '
const fs = require("fs");
const mode = process.argv[1], file = process.argv[2], path = process.argv[3] || "";
const text = fs.readFileSync(file, "utf8");
let data = null;
try { data = JSON.parse(text); } catch {}
const find = (value, key) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = find(item, key);
      if (found !== undefined) return found;
    }
  } else if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
    for (const item of Object.values(value)) {
      const found = find(item, key);
      if (found !== undefined) return found;
    }
  }
};
if (mode === "json" || mode === "json_optional") {
  let value = data;
  for (const key of path.split(".")) value = value?.[key];
  if (value === undefined || value === null || (mode === "json" && value === "")) process.exit(mode === "json" ? 2 : 0);
  process.stdout.write(String(value));
} else if (mode === "deploy_status") {
  const errorMessage = find(data, "error_message");
  process.stdout.write(typeof errorMessage === "string" && errorMessage ? "failed" : (find(data, "execution_result") !== undefined || /success|processed/i.test(text) ? "confirmed" : "pending_or_unverified"));
} else if (mode === "state_root") {
  const match = text.match(/state[_ -]?root[_ -]?hash[^0-9a-f]*([0-9a-f]{32,})/i);
  process.stdout.write(String(find(data, "state_root_hash") || match?.[1] || ""));
} else if (mode === "cl_value") {
  process.stdout.write(String(find(data, "parsed") || find(data, "bytes") || ""));
}
' "$@"
}

json_optional() {
  if [[ -z "${PROOF_FILE}" ]]; then
    return 0
  fi
  node_extract json_optional "${PROOF_FILE}" "$1"
}
deploy_status() { node_extract deploy_status "$1"; }
state_root_hash() { node_extract state_root "$1"; }
cl_value() { node_extract cl_value "$1"; }

proof_value() {
  local env_name="$1"
  local proof_path="$2"
  local required="${3:-true}"
  local value="${!env_name:-}"
  if [[ -z "${value}" && -n "${PROOF_FILE}" ]]; then
    value="$(json_optional "${proof_path}" || true)"
  fi
  if [[ -z "${value}" && "${required}" == "true" ]]; then
    echo "${env_name} is required; pass it as an env var, CLI option, or --proof-file field." >&2
    exit 1
  fi
  printf '%s' "${value}"
}

require_confirmed() {
  local label="$1"
  local hash="$2"
  local output_file="${TMP_DIR}/${label}.json"
  echo "[live-proof] get-deploy ${label}"
  "${CASPER_CLIENT}" get-deploy --node-address "${NODE_ADDRESS}" "${hash}" >"${output_file}"
  local status
  status="$(deploy_status "${output_file}")"
  if [[ "${status}" != "confirmed" ]]; then
    echo "${label} deploy is ${status}, expected confirmed." >&2
    exit 1
  fi
  echo "[live-proof] ${label} confirmed"
}

command -v "${CASPER_CLIENT}" >/dev/null

INSTALL_DEPLOY_HASH="$(proof_value CASPER_CONTRACT_INSTALL_DEPLOY_HASH liveProof.contractInstallDeployHash)"
DECISION_DEPLOY_HASH="$(proof_value CASPER_DECISION_DEPLOY_HASH liveProof.decisionDeployHash)"
CONTRACT_HASH="$(proof_value CASPER_DECISION_CONTRACT_HASH liveProof.contractHash)"
PROOF_DIGEST="$(proof_value CASPER_PROOF_DIGEST liveProof.proofDigest)"
DECISION_ID="$(proof_value CASPER_DECISION_ID liveProof.decisionId)"
DECISION_RECEIPT="$(proof_value CASPER_DECISION_RECEIPT liveProof.decisionReceipt false)"
if [[ -z "${DECISION_RECEIPT}" ]]; then
  echo "CASPER_DECISION_RECEIPT is missing; refresh the dashboard proof log after live submission." >&2
  exit 1
fi
QUERY_KEY="${CONTRACT_HASH}"
if [[ "${QUERY_KEY}" != hash-* && "${QUERY_KEY}" != account-hash-* && "${QUERY_KEY}" != uref-* ]]; then
  QUERY_KEY="hash-${QUERY_KEY}"
fi

require_confirmed "contract-install" "${INSTALL_DEPLOY_HASH}"
require_confirmed "decision" "${DECISION_DEPLOY_HASH}"

STATE_ROOT_OUTPUT="${TMP_DIR}/state-root.json"
echo "[live-proof] get-state-root-hash"
"${CASPER_CLIENT}" get-state-root-hash --node-address "${NODE_ADDRESS}" >"${STATE_ROOT_OUTPUT}"
STATE_ROOT="$(state_root_hash "${STATE_ROOT_OUTPUT}")"
if [[ -z "${STATE_ROOT}" ]]; then
  echo "Unable to parse Casper state root hash." >&2
  exit 1
fi

DIGEST_OUTPUT="${TMP_DIR}/latest-proof-digest.json"
echo "[live-proof] query latest_proof_digest"
"${CASPER_CLIENT}" query-global-state \
  --node-address "${NODE_ADDRESS}" \
  --state-root-hash "${STATE_ROOT}" \
  --key "${QUERY_KEY}" \
  -q latest_proof_digest \
  >"${DIGEST_OUTPUT}"

OBSERVED_DIGEST="$(cl_value "${DIGEST_OUTPUT}")"
if [[ "${OBSERVED_DIGEST}" != "${PROOF_DIGEST}" ]]; then
  echo "Proof digest mismatch." >&2
  echo "expected: ${PROOF_DIGEST}" >&2
  echo "observed: ${OBSERVED_DIGEST}" >&2
  exit 1
fi

LATEST_RECEIPT_OUTPUT="${TMP_DIR}/latest-decision-receipt.json"
echo "[live-proof] query latest_decision_receipt"
"${CASPER_CLIENT}" query-global-state \
  --node-address "${NODE_ADDRESS}" \
  --state-root-hash "${STATE_ROOT}" \
  --key "${QUERY_KEY}" \
  -q latest_decision_receipt \
  >"${LATEST_RECEIPT_OUTPUT}"

OBSERVED_LATEST_RECEIPT="$(cl_value "${LATEST_RECEIPT_OUTPUT}")"
if [[ "${OBSERVED_LATEST_RECEIPT}" != "${DECISION_RECEIPT}" ]]; then
  echo "Latest decision receipt mismatch." >&2
  echo "expected: ${DECISION_RECEIPT}" >&2
  echo "observed: ${OBSERVED_LATEST_RECEIPT}" >&2
  exit 1
fi

RECEIPT_OUTPUT="${TMP_DIR}/decision-receipt.json"
echo "[live-proof] get dictionary decision_receipts/${DECISION_ID}"
"${CASPER_CLIENT}" get-dictionary-item \
  --node-address "${NODE_ADDRESS}" \
  --state-root-hash "${STATE_ROOT}" \
  --contract-hash "${QUERY_KEY}" \
  --dictionary-name decision_receipts \
  --dictionary-item-key "${DECISION_ID}" \
  >"${RECEIPT_OUTPUT}"

OBSERVED_RECEIPT="$(cl_value "${RECEIPT_OUTPUT}")"
if [[ "${OBSERVED_RECEIPT}" != "${DECISION_RECEIPT}" ]]; then
  echo "Per-decision receipt mismatch." >&2
  echo "expected: ${DECISION_RECEIPT}" >&2
  echo "observed: ${OBSERVED_RECEIPT}" >&2
  exit 1
fi

echo "[live-proof] contract install deploy: ${INSTALL_DEPLOY_HASH}"
echo "[live-proof] decision deploy: ${DECISION_DEPLOY_HASH}"
echo "[live-proof] state root: ${STATE_ROOT}"
echo "[live-proof] proof digest verified: ${OBSERVED_DIGEST}"
echo "[live-proof] decision receipt verified: ${OBSERVED_RECEIPT}"
echo "[live-proof] ok"
