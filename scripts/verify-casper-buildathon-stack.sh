#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8016}"
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
BACKEND_LOG="${TMPDIR:-/tmp}/omniagent-casper-backend-${BACKEND_PORT}.log"
SESSION_JAR="${TMPDIR:-/tmp}/omniagent-casper-session-${BACKEND_PORT}.cookies"
SNAPSHOT_JSON="${TMPDIR:-/tmp}/omniagent-casper-dashboard-snapshot-${BACKEND_PORT}.json"
RECEIPTS_JSON="${TMPDIR:-/tmp}/omniagent-casper-dashboard-receipts-${BACKEND_PORT}.json"
PUBLIC_PROOF_JSON="${TMPDIR:-/tmp}/omniagent-casper-public-proof-${BACKEND_PORT}.json"
OPERATOR_TOKEN="local-casper-verifier-token"
BACKEND_PID=""

cleanup() {
  if [[ -n "${BACKEND_PID}" ]]; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi
  rm -f "${SESSION_JAR}" "${SNAPSHOT_JSON}" "${RECEIPTS_JSON}" "${PUBLIC_PROOF_JSON}"
}
trap cleanup EXIT

cd "${ROOT_DIR}"

echo "[casper] backend compile"
uv run --project backend python -m compileall backend/app backend/scripts

echo "[casper] backend tests"
uv run --project backend python -m pytest -q backend/tests

echo "[casper] contract check"
cargo +nightly-2025-03-01 check \
  --manifest-path contracts/casper-decision-proof/Cargo.toml \
  --target wasm32v1-none

echo "[casper] contract release build"
cargo +nightly-2025-03-01 build \
  --manifest-path contracts/casper-decision-proof/Cargo.toml \
  --release \
  --target wasm32v1-none

echo "[casper] frontend tests"
pnpm -C frontend test -- --run

echo "[casper] frontend build"
pnpm -C frontend run build

echo "[casper] frontend e2e"
pnpm -C frontend run test:e2e -- e2e/tests/casper-proof-dashboard.spec.ts

echo "[casper] safe backend"
(
  cd backend
  env \
    OMNIAGENT_SKIP_ENV_FILE=true \
    CASPER_LIVE_SUBMIT_ENABLED=false \
    CASPER_DECISION_LEDGER_PATH="verifier-casper-dashboard-log-${BACKEND_PORT}" \
    API_OPERATOR_TOKEN="${OPERATOR_TOKEN}" \
    uv run --project . uvicorn app.main:app --host 127.0.0.1 --port "${BACKEND_PORT}" \
      >"${BACKEND_LOG}" 2>&1
) &
BACKEND_PID="$!"

for _ in {1..40}; do
  if curl -fsS "${BACKEND_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
curl -fsS "${BACKEND_URL}/health" >/dev/null

echo "[casper] readiness gate (expected blocked without live account)"
set +e
PYTHONPATH=backend uv run --project backend python backend/scripts/check-casper-testnet-readiness.py --api-url "${BACKEND_URL}"
READINESS_CODE="$?"
set -e
if [[ "${READINESS_CODE}" -eq 0 ]]; then
  echo "Casper readiness unexpectedly passed; verify live account/deploy/readback evidence manually."
else
  echo "Casper readiness blocked as expected until account/signing/contract settings exist."
fi

echo "[casper] dry-run decision"
PYTHONPATH=backend uv run --project backend python backend/scripts/run-casper-decision-cycle.py \
  --api-url "${BACKEND_URL}" \
  --operator-token "${OPERATOR_TOKEN}" \
  --dry-run

echo "[casper] dashboard proof log"
curl -fsS -c "${SESSION_JAR}" "${BACKEND_URL}/api/session" >/dev/null
curl -fsS -b "${SESSION_JAR}" "${BACKEND_URL}/api/dashboard/snapshot?limit=8" -o "${SNAPSHOT_JSON}"
curl -fsS -b "${SESSION_JAR}" "${BACKEND_URL}/api/dashboard/receipts?limit=10" -o "${RECEIPTS_JSON}"
curl -fsS "${BACKEND_URL}/api/public/proof" -o "${PUBLIC_PROOF_JSON}"
node -e '
const fs = require("fs");
const [snapshotPath, receiptsPath, publicProofPath] = process.argv.slice(1);
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
const receipts = JSON.parse(fs.readFileSync(receiptsPath, "utf8"));
const proof = JSON.parse(fs.readFileSync(publicProofPath, "utf8"));
const snapshotText = JSON.stringify(snapshot);
const receiptsText = JSON.stringify(receipts);
const proofText = JSON.stringify(proof);
if (snapshot.network !== "casper") throw new Error("dashboard snapshot is not Casper-scoped");
if (!snapshot.casperProofBundle?.ledger?.configured) throw new Error("dashboard proof log is not configured");
if (!Array.isArray(receipts.receipts) || receipts.receipts.length < 1) throw new Error("dashboard receipts did not render the dry-run log");
if (!receipts.receipts.some((receipt) => receipt.decisionId && receipt.proofDigest)) throw new Error("dashboard log is missing receipt proof fields");
if (proof.scenario !== "rwa-collateral-nav-risk-receipt") throw new Error("public proof scenario mismatch");
if (proof.status === "live_verified" && proof.readback?.verified !== true) throw new Error("public proof overclaims live verification");
if (/CASPER_SECRET_KEY_PATH|API_OPERATOR_TOKEN|secret\.pem|\.env/.test(proofText)) throw new Error("public proof leaked private material");
if (/proofs\/|plans\/|ledgerPath/.test(snapshotText + receiptsText)) throw new Error("dashboard leaked internal artifact paths");
console.log(`dashboard log receipts: ${receipts.receipts.length}`);
' "${SNAPSHOT_JSON}" "${RECEIPTS_JSON}" "${PUBLIC_PROOF_JSON}"

echo "[casper] tracked proof artifact"
git ls-files --error-unmatch proofs/casper-buildathon-submission-proof.json >/dev/null || {
  echo "Tracked proof artifact missing from git index." >&2
  exit 1
}
test -f proofs/casper-buildathon-submission-proof.json
node -e '
const fs = require("fs");
const proof = JSON.parse(fs.readFileSync("proofs/casper-buildathon-submission-proof.json", "utf8"));
const text = JSON.stringify(proof);
if (proof.scenario !== "rwa-collateral-nav-risk-receipt") throw new Error("tracked proof scenario mismatch");
if (proof.status === "live_verified" && proof.readback?.verified !== true) throw new Error("tracked proof overclaims live verification");
if (/CASPER_SECRET_KEY_PATH|API_OPERATOR_TOKEN|secret\.pem|\.env/.test(text)) throw new Error("tracked proof leaked private material");
'

echo "[casper] tracked secret hygiene"
if git ls-files | rg '(^|/)\.env($|\.)' | rg -v '\.env\.example$' >/dev/null; then
  echo "Tracked dotenv file detected." >&2
  exit 1
fi
git ls-files -z \
  | xargs -0 rg --no-messages -l 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|PRIVATE_KEY=.*[^[:space:]]|API_KEY=.*[^[:space:]]|SECRET=.*[^[:space:]]' \
  | rg -v '^backend/\.env\.example$|^frontend/\.env\.example$|^docs/|^plans/|^RAILWAY\.md$|^scripts/check-secrets\.sh$|^scripts/verify-casper-buildathon-stack\.sh$' \
  && { echo "Potential secret material in tracked source files." >&2; exit 1; } \
  || true

echo "[casper] ok"
