// SPDX-License-Identifier: MIT
/**
 * deployStableSwapLpAdapter.js
 *
 * Deploys StableSwapLPYieldAdapter as the 3rd yield rail for ProofVault V2.
 *
 * Pre-requisites:
 *   - ProofVaultV2 deployed (PROOF_VAULT_V2 env var)
 *   - PCS StableSwap pool address confirmed
 *   - USDT and LP token addresses set
 *   - PRIVATE_KEY in .env with deployer EOA funded with BNB
 *
 * Post-deploy (manual):
 *   1. Call adapter.setVault(PROOF_VAULT_V2)
 *   2. Call adapter.lockConfiguration()
 *   3. Register adapter with ProofVaultV2 / StrategyEngineV2 as needed
 */

const { ethers } = require("hardhat");

// ── Mainnet addresses ────────────────────────────────────────────────────────
const USDT         = "0x55d398326f99059fF775485246999027B3197955";
const PCS_SS_POOL  = "0x176f274335c8B5fD5Ec5e8274d0cf36b08E44A57"; // USDF/USDT StableSwap
// LP token for PCS StableSwap pools is the pool contract itself
const LP_TOKEN     = PCS_SS_POOL;

const PROOF_VAULT_V2 = process.env.PROOF_VAULT_V2 || "0xaB4F67AfCb9B9C390049705022A0237E81465C00";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  console.log("\nDeploying StableSwapLPYieldAdapter...");
  const Adapter = await ethers.getContractFactory("StableSwapLPYieldAdapter");
  const adapter = await Adapter.deploy(
    USDT,
    LP_TOKEN,
    PCS_SS_POOL,
    deployer.address
  );
  await adapter.waitForDeployment();
  console.log("StableSwapLPYieldAdapter deployed to:", adapter.target);

  console.log("\nSetting vault...");
  const tx1 = await adapter.setVault(PROOF_VAULT_V2);
  await tx1.wait();
  console.log("Vault set to:", PROOF_VAULT_V2);

  console.log("\nLocking configuration (renounces ownership)...");
  const tx2 = await adapter.lockConfiguration();
  await tx2.wait();
  console.log("Configuration locked. Owner:", await adapter.owner());

  console.log("\n=== Deployment complete ===");
  console.log("StableSwapLPYieldAdapter:", adapter.target);
  console.log("asset():", await adapter.asset());
  console.log("vault():", await adapter.vault());
  console.log("configurationLocked:", await adapter.configurationLocked());
  console.log("\nNext: register this adapter with StrategyEngineV2 or ProofVaultV2 as the 3rd rail.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
