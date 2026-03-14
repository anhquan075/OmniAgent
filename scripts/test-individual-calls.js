const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await ethers.getSigners();
    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    const breaker = await ethers.getContractAt("CircuitBreaker", addresses.breaker);
    const vault = await ethers.getContractAt("ProofVault", addresses.vault);
    const engine = await ethers.getContractAt("StrategyEngine", addresses.strategyEngine);

    console.log("\n--- Testing checkBreaker() ---");
    try {
        const tx = await breaker.checkBreaker();
        await tx.wait();
        console.log("checkBreaker successful!");
    } catch (e) {
        console.error("checkBreaker FAILED:", e.message);
    }

    console.log("\n--- Testing vault.rebalance (Manual) ---");
    // Try to call rebalance directly from owner (should revert with CallerNotEngine, but we check if it REVERTS or just fails)
    try {
        const tx = await vault.rebalance(7000, 100, deployer.address, 0, 2000);
        await tx.wait();
        console.log("rebalance successful (Wait, it should have failed with CallerNotEngine!)");
    } catch (e) {
        console.log("rebalance failed as expected (or unexpectedly):", e.message);
    }
}

main().catch(console.error);
