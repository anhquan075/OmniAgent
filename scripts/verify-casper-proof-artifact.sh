#!/usr/bin/env bash
# Offline check: committed public proof must be live_verified + judge-complete.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROOF_FILE="${1:-${ROOT_DIR}/proofs/casper-buildathon-submission-proof.json}"

node -e '
const fs = require("fs");
const path = process.argv[1];
const proof = JSON.parse(fs.readFileSync(path, "utf8"));
const text = JSON.stringify(proof);
const fail = (msg) => { console.error(msg); process.exit(1); };
if (proof.scenario !== "rwa-collateral-nav-risk-receipt") fail("scenario mismatch");
if (proof.status !== "live_verified") fail(`status=${proof.status}, expected live_verified`);
if (proof.readback?.verified !== true) fail("readback.verified must be true");
if (!proof.deployHash || !proof.explorerUrl) fail("missing decision deploy explorer link");
if (!String(proof.explorerUrl).includes(String(proof.deployHash))) fail("explorerUrl does not match deployHash");
if ((proof.cheatReverts?.readyCount ?? 0) < 6) fail("cheatReverts.readyCount < 6");
if (proof.vault?.verificationMode !== "cross_contract") fail("vault is not cross-contract verified");
if (proof.authoring?.mode !== "agent_acl") fail("decision authoring is not agent_acl");
if (!String(proof.authoring?.authorizedAgentAccountHash || "").startsWith("9b62ecfb")) {
  fail("authorized agent account hash missing/unexpected");
}
if (!proof.vault?.transactionHash) fail("missing verified vault canary hash");
if ((proof.paidAct?.readyCount ?? 0) < 3) fail("paidAct.readyCount < 3");
if ((proof.deskStory?.readyCount ?? 0) < 5) fail("deskStory.readyCount < 5");
if (!proof.authoring?.lastBlocked?.transactionHash) fail("authoring.lastBlocked missing");
if (proof.x402?.status !== "verified") fail(`x402.status=${proof.x402?.status}`);
const settle = proof.x402?.receipt?.settlementTxHash || proof.paidAct?.settlementTxHash;
if (!settle) fail("missing x402 settlementTxHash");
if (/CASPER_SECRET_KEY_PATH|API_OPERATOR_TOKEN|secret\.pem|\.env/.test(text)) fail("secret material leaked");
console.log(`[proof-artifact] ok status=${proof.status} action=${proof.action} deploy=${String(proof.deployHash).slice(0, 12)}…`);
' "${PROOF_FILE}"
