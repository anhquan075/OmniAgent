const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Testing Circuit Breaker on Polkadot Hub with account:", deployer.address);

    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    const breaker = await ethers.getContractAt("CircuitBreaker", addresses.breaker);
    const mockChainlink = await ethers.getContractAt("MockChainlinkAggregator", addresses.mockChainlink);

    console.log("\n--- Initial State ---");
    let status = await breaker.previewBreaker();
    console.log("Paused:", status.paused);
    console.log("Signal A (Price Deviation):", status.signalA);

    console.log("\n--- Tripping Circuit Breaker (Signal A) ---");
    // Set price to $0.90 (10% drop, should trip if threshold is lower)
    const crashPrice = ethers.parseUnits("0.9", 8);
    const now = Math.floor(Date.now() / 1000);
    
    console.log("Setting price to $0.90...");
    let tx = await mockChainlink.setRound(crashPrice, now);
    await tx.wait();

    console.log("Checking breaker...");
    tx = await breaker.checkBreaker();
    await tx.wait();

    status = await breaker.previewBreaker();
    console.log("Paused after crash:", status.paused);
    console.log("Signal A after crash:", status.signalA);

    if (status.paused) {
        console.log("✅ Circuit Breaker tripped successfully!");
    } else {
        console.log("❌ Circuit Breaker failed to trip. Check thresholds.");
    }

    console.log("\n--- Recovering Circuit Breaker ---");
    console.log("Restoring price to $1.00...");
    const normalPrice = ethers.parseUnits("1.0", 8);
    tx = await mockChainlink.setRound(normalPrice, now);
    await tx.wait();

    console.log("Checking breaker (should still be paused due to cooldown)...");
    tx = await breaker.checkBreaker();
    await tx.wait();

    status = await breaker.previewBreaker();
    console.log("Paused after recovery call:", status.paused);
    console.log("Signal A after recovery call:", status.signalA);

    console.log("\nNote: Full recovery requires cooldown to elapse.");
    console.log("Circuit Breaker Test Complete! ✅");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
