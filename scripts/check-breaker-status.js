const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    const breaker = await ethers.getContractAt("CircuitBreaker", addresses.breaker);
    const status = await breaker.previewBreaker();
    
    console.log("Circuit Breaker Status:");
    console.log(`  Paused: ${status.paused}`);
    console.log(`  Signal A (Chainlink): ${status.signalA}`);
    console.log(`  Signal B (Reserve Ratio): ${status.signalB}`);
    console.log(`  Signal C (Virtual Price): ${status.signalC}`);
    console.log(`  Last Trip: ${new Date(Number(status.lastTripTimestamp) * 1000).toLocaleString()}`);
    console.log(`  Recovery: ${new Date(Number(status.recoveryTimestamp) * 1000).toLocaleString()}`);
}

main().catch(console.error);
