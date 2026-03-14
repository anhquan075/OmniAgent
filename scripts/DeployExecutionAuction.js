/**
 * Deploy ExecutionAuction (RRA — Rebalance Rights Auction) to BNB Chain Mainnet.
 *
 * Works as an overlay on the existing deployed V2 stack — no vault re-deployment needed.
 * Searchers bid USDT for exclusive execution rights; winning bid flows to vault as yield.
 *
 * Usage:
 *   npx hardhat run scripts/deployExecutionAuction.js --network bnb
 */

const { ethers } = require("hardhat");

// ─── V2 Mainnet Addresses ─────────────────────────────────────────────────────
const V2 = {
  ENGINE: process.env.V2_ENGINE_ADDRESS || "0xb621062d6651E1D975e3134c86FA9db1fab909B7",
  VAULT:  process.env.V2_VAULT_ADDRESS  || "0xCF386Dd2c8C8356cdBF76e5c3D53B5Ef89362644",
  USDT:   process.env.V2_ASSET_ADDRESS  || "0x55d398326f99059fF775485246999027B3197955",
};

// ─── Auction Parameters ───────────────────────────────────────────────────────
const PARAMS = {
  BID_WINDOW:     120,                       // 2 min: bid phase duration
  EXECUTE_WINDOW: 60,                        // 1 min: winner's exclusive execution window
  MIN_BID:        ethers.parseEther("1"),   // 1 USDT minimum bid
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ExecutionAuction (RRA)");
  console.log("  Deployer:", deployer.address);
  console.log("  Network: BNB Chain Mainnet");
  console.log("  Engine (StrategyEngineV2):", V2.ENGINE);
  console.log("  Vault  (ProofVaultV2):    ", V2.VAULT);
  console.log("  Bid window:    ", PARAMS.BID_WINDOW, "seconds");
  console.log("  Execute window:", PARAMS.EXECUTE_WINDOW, "seconds");
  console.log("  Min bid:       ", ethers.formatEther(PARAMS.MIN_BID), "USDT");
  console.log("");

  const ExecutionAuction = await ethers.getContractFactory("ExecutionAuction");
  const auction = await ExecutionAuction.deploy(
    V2.ENGINE,
    V2.VAULT,
    V2.USDT,
    PARAMS.BID_WINDOW,
    PARAMS.EXECUTE_WINDOW,
    PARAMS.MIN_BID,
    500 // minBidIncrementBps = 5%
  );
  await auction.waitForDeployment();
  const address = await auction.getAddress();

  console.log("ExecutionAuction deployed:", address);
  console.log("");
  console.log("Economics flip: vault earns bid revenue instead of paying bounty.");
  console.log("  Net vault gain per cycle = bid_amount - bounty_paid");
  console.log("  Bid routing:    winner → auction → vault");
  console.log("  Bounty routing: vault → auction → winner");
  console.log("");
  console.log("Verify on BscScan:");
  console.log(`  npx hardhat verify --network bnb ${address} \\`);
  console.log(`    ${V2.ENGINE} ${V2.VAULT} ${V2.USDT} \\`);
  console.log(`    ${PARAMS.BID_WINDOW} ${PARAMS.EXECUTE_WINDOW} "${PARAMS.MIN_BID}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
