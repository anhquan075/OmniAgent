#!/usr/bin/env node
/**
 * Live Casper x402 settle against OmniAgent paywall (or facilitator directly).
 *
 * Prerequisites:
 *   npm install @make-software/casper-x402 casper-js-sdk
 *   CLIENT_PRIVATE_KEY_PATH=/path/to/secret_key.pem
 *   Buyer must hold ≥ amount atomic units of the CasCet/WCSPR CEP-18 package
 *   (default cb65a928… — no hash- prefix).
 *
 * Usage:
 *   CLIENT_PRIVATE_KEY_PATH=../keys/secret_key.pem \\
 *     node scripts/settle_x402_casper_live.mjs
 *   OMNI_BASE_URL=https://omniyield.app node scripts/settle_x402_casper_live.mjs
 *   DIRECT_FACILITATOR=1 node scripts/settle_x402_casper_live.mjs
 */

import { createClientCasperSigner } from "@make-software/casper-x402";
import { ExactCasperScheme } from "@make-software/casper-x402/exact/client";
import casperSdk from "casper-js-sdk";

const { KeyAlgorithm } = casperSdk;

const BASE = (process.env.OMNI_BASE_URL || "https://omniyield.app").replace(/\/$/, "");
const KEY_PATH = process.env.CLIENT_PRIVATE_KEY_PATH;
const API_KEY =
  process.env.CASPER_X402_FACILITATOR_API_KEY ||
  process.env.CASPER_CSPR_CLOUD_API_KEY ||
  "";
const DIRECT = process.env.DIRECT_FACILITATOR === "1";
const ALGO =
  (process.env.CLIENT_KEY_ALGO || "ed25519").toLowerCase() === "secp256k1"
    ? KeyAlgorithm.SECP256K1
    : KeyAlgorithm.ED25519;

function b64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

function normalizeAsset(asset) {
  let value = String(asset || "").trim();
  if (value.startsWith("hash-")) value = value.slice(5);
  if (value.startsWith("0x")) value = value.slice(2);
  return value.toLowerCase();
}

async function main() {
  if (!KEY_PATH) {
    console.error("FAIL: set CLIENT_PRIVATE_KEY_PATH to a PEM buyer key");
    process.exit(2);
  }

  const setup = await fetch(`${BASE}/api/x402/setup`).then((r) => r.json());
  console.log(
    "setup",
    setup.status,
    "settleReady",
    setup.settleReady,
    "network",
    setup.paymentNetwork,
    "asset",
    setup.asset,
  );

  const unpaid = await fetch(`${BASE}/api/x402/rwa-evidence`);
  const unpaidBody = await unpaid.json();
  if (unpaid.status !== 402) {
    console.error("FAIL: expected HTTP 402, got", unpaid.status, unpaidBody);
    process.exit(1);
  }
  const req = unpaidBody.accepts[0];
  const requirements = {
    ...req,
    asset: normalizeAsset(req.asset),
  };
  console.log("requirements.asset", requirements.asset);

  const signer = await createClientCasperSigner(KEY_PATH, ALGO);
  console.log("buyerAccount", signer.accountAddress());
  console.log("buyerPub", signer.publicKey());

  const scheme = new ExactCasperScheme(signer);
  const created = await scheme.createPaymentPayload(2, requirements);
  const paymentPayload = {
    x402Version: 2,
    resource: { url: requirements.resource },
    accepted: {
      scheme: requirements.scheme,
      network: requirements.network,
      asset: requirements.asset,
      amount: requirements.amount,
      payTo: requirements.payTo,
      maxTimeoutSeconds: requirements.maxTimeoutSeconds,
    },
    payload: created.payload,
  };

  if (DIRECT) {
    if (!API_KEY) {
      console.error("FAIL: DIRECT_FACILITATOR=1 needs CASPER_X402_FACILITATOR_API_KEY");
      process.exit(2);
    }
    const facilitator =
      process.env.CASPER_X402_FACILITATOR_URL || "https://x402-facilitator.cspr.cloud";
    const resp = await fetch(`${facilitator.replace(/\/$/, "")}/settle`, {
      method: "POST",
      headers: {
        authorization: API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        x402Version: 2,
        paymentPayload,
        paymentRequirements: requirements,
      }),
    });
    const data = await resp.json();
    console.log(JSON.stringify(data, null, 2));
    if (data.transaction) {
      console.log("EXPLORER", `https://testnet.cspr.live/deploy/${data.transaction}`);
    }
    process.exit(data.success ? 0 : 1);
  }

  const header = b64(paymentPayload);
  const paid = await fetch(`${BASE}/api/x402/rwa-evidence`, {
    headers: { "X-PAYMENT": header, "PAYMENT-SIGNATURE": header },
  });
  const text = await paid.text();
  const respHdr =
    paid.headers.get("X-PAYMENT-RESPONSE") || paid.headers.get("Payment-Response");
  console.log("paid status", paid.status);
  if (respHdr) {
    const decoded = JSON.parse(Buffer.from(respHdr, "base64").toString());
    console.log("settlement", JSON.stringify(decoded, null, 2));
    if (decoded.transaction) {
      console.log("EXPLORER", `https://testnet.cspr.live/deploy/${decoded.transaction}`);
    }
  }
  console.log(text.slice(0, 2500));
  process.exit(paid.status === 200 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
