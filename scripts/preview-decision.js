const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    const engine = await ethers.getContractAt("StrategyEngine", addresses.strategyEngine);

    try {
        const preview = await engine.previewDecision();
        console.log("Decision Preview:");
        console.log(`  Executable: ${preview.executable}`);
        console.log(`  Reason: ${ethers.decodeBytes32String(preview.reason)}`);
        console.log(`  Next State: ${preview.nextState}`);
        console.log(`  Price: ${preview.price.toString()}`);
        console.log(`  Volatility: ${preview.volatilityBps.toString()} bps`);
        console.log(`  Target Aster: ${preview.targetAsterBps.toString()} bps`);
        console.log(`  Target LP: ${preview.targetLpBps.toString()} bps`);
        console.log(`  Bounty: ${preview.bountyBps.toString()} bps`);
        console.log(`  Breaker Paused: ${preview.breakerPaused}`);
    } catch (e) {
        console.error("Preview FAILED:");
        console.error(e);
    }
}

main().catch(console.error);
