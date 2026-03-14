const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await ethers.getSigners();
    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    const sharpe = await ethers.getContractAt("SharpeTracker", addresses.sharpeTracker);
    
    console.log("Linking StrategyEngine to SharpeTracker...");
    const tx = await sharpe.setEngine(addresses.strategyEngine);
    console.log(`Transaction sent: ${tx.hash}`);
    await tx.wait();
    console.log("Linked successfully! ✅");
}

main().catch(console.error);
