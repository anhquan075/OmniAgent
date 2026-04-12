#!/usr/bin/env node
/**
 * Deploy VaultGate (+ embedded Verifier) to HashKey Chain testnet
 * Usage: node deploy.js
 */
const { ethers } = require("/Users/quannguyen/Documents/coding-stuff/OmniAgent/backend/node_modules/ethers");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://testnet.hsk.xyz";
const PRIVATE_KEY = "0xb94e30b9827852ef3dfa000b6041b6548d0bce4b6c5413801a84c7670f0a4b4b";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const network = await provider.getNetwork();
  console.log(`Chain ID: ${network.chainId}`);
  console.log(`Deployer: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} HSK`);

  const dir = path.dirname(__filename);

  // Deploy Verifier first (VaultGate embeds it via constructor, but we also need standalone)
  console.log("\nDeploying Verifier...");
  const verifierBin = "0x" + fs.readFileSync(path.join(dir, "Verifier_sol_Verifier.bin"), "utf8").trim();
  const verifierAbi = JSON.parse(fs.readFileSync(path.join(dir, "Verifier_sol_Verifier.abi"), "utf8"));
  const VerifierFactory = new ethers.ContractFactory(verifierAbi, verifierBin, wallet);
  const verifier = await VerifierFactory.deploy({ gasLimit: 5_000_000 });
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log(`Verifier deployed: ${verifierAddr}`);

  // Deploy VaultGate (deploys its own Verifier internally)
  console.log("\nDeploying VaultGate...");
  const vaultBin = "0x" + fs.readFileSync(path.join(dir, "VaultGate_sol_VaultGate.bin"), "utf8").trim();
  const vaultAbi = JSON.parse(fs.readFileSync(path.join(dir, "VaultGate_sol_VaultGate.abi"), "utf8"));
  const VaultGateFactory = new ethers.ContractFactory(vaultAbi, vaultBin, wallet);
  const vaultGate = await VaultGateFactory.deploy({ gasLimit: 8_000_000 });
  await vaultGate.waitForDeployment();
  const vaultGateAddr = await vaultGate.getAddress();
  console.log(`VaultGate deployed: ${vaultGateAddr}`);

  const embeddedVerifier = await vaultGate.getVerifier();
  console.log(`Embedded Verifier at: ${embeddedVerifier}`);

  console.log("\n=== DEPLOYMENT SUMMARY ===");
  console.log(`Verifier (standalone): ${verifierAddr}`);
  console.log(`VaultGate:             ${vaultGateAddr}`);
  console.log(`Explorer: https://testnet-explorer.hsk.xyz/address/${vaultGateAddr}`);
  console.log(`\nUpdate .env:`);
  console.log(`HASHKEY_ZK_VERIFIER_ADDRESS=${verifierAddr}`);
  console.log(`ZK_VERIFIER_ADDRESS=${verifierAddr}`);
  console.log(`HASHKEY_VAULT_GATE_ADDRESS=${vaultGateAddr}`);
}

main().catch(console.error);
