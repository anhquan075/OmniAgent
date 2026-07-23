#!/usr/bin/env node
/**
 * Wrap Testnet CSPR into Wrapped CSPR (package 3d80df21…) via cargo-proxy deposit.
 *
 * Prerequisites:
 *   - Buyer PEM with enough CSPR for wrap amount + ~8 CSPR payment
 *   - cargo-proxy.wasm beside this script or WRAP_PROXY_WASM path
 *
 * Usage:
 *   CLIENT_PRIVATE_KEY_PATH=/path/to/secret_key.pem \\
 *     node scripts/wrap_wcspr_once.mjs [cspr_amount]
 *
 * Default wrap amount: 1 CSPR (enough for many 0.001 WCSPR x402 settles).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import casper from "casper-js-sdk";

const {
  PrivateKey,
  KeyAlgorithm,
  SessionBuilder,
  Args,
  CLValue,
  CLTypeUInt8,
  RpcClient,
  HttpHandler,
} = casper;

const RPC = process.env.CASPER_NODE_RPC || "https://node.testnet.casper.network/rpc";
const CHAIN = process.env.CASPER_CHAIN_NAME || "casper-test";
const WCSPR =
  process.env.CASPER_X402_ASSET?.replace(/^hash-/, "") ||
  "3d80df21ba4ee4d66a2a1f60c32570dd5685e4b279f6538162a5fd1314847c1e";
const KEY_PATH = process.env.CLIENT_PRIVATE_KEY_PATH;
const ALGO =
  (process.env.CLIENT_KEY_ALGO || "ed25519").toLowerCase() === "secp256k1"
    ? KeyAlgorithm.SECP256K1
    : KeyAlgorithm.ED25519;

const here = dirname(fileURLToPath(import.meta.url));
const proxyPath =
  process.env.WRAP_PROXY_WASM || join(here, "wasm", "cargo-proxy.wasm");

if (!KEY_PATH) {
  console.error("FAIL: set CLIENT_PRIVATE_KEY_PATH");
  process.exit(2);
}

const cspr = Number(process.argv[2] ?? 1);
const motes = (BigInt(Math.round(cspr)) * 1_000_000_000n).toString();
const key = PrivateKey.fromPem(readFileSync(KEY_PATH, "utf8"), ALGO);
const rpc = new RpcClient(new HttpHandler(RPC));
const proxy = new Uint8Array(readFileSync(proxyPath));

const innerArgs = Args.fromMap({ attached_value: CLValue.newCLUInt512(motes) }).toBytes();
const args = Args.fromMap({
  package_hash: CLValue.newCLByteArray(Uint8Array.from(Buffer.from(WCSPR, "hex"))),
  entry_point: CLValue.newCLString("deposit"),
  args: CLValue.newCLList(
    CLTypeUInt8,
    Array.from(innerArgs, (b) => CLValue.newCLUint8(b)),
  ),
  amount: CLValue.newCLUInt512(motes),
  attached_value: CLValue.newCLUInt512(motes),
});

const tx = new SessionBuilder()
  .wasm(proxy)
  .installOrUpgrade()
  .runtimeArgs(args)
  .chainName(CHAIN)
  .payment(8_000_000_000, 1)
  .from(key.publicKey)
  .build();
tx.sign(key);

const res = await rpc.putTransaction(tx);
const hash = res.transactionHash.toHex();
console.log(`wrap ${cspr} CSPR -> WCSPR (${WCSPR})`);
console.log("buyer", key.publicKey.toHex());
console.log("tx", hash);
console.log("explorer", `https://testnet.cspr.live/transaction/${hash}`);
