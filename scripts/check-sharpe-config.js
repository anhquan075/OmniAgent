const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    const sharpe = await ethers.getContractAt("SharpeTracker", addresses.sharpeTracker);
    const engine = await sharpe.engine();
    
    console.log(`SharpeTracker Engine: ${engine}`);
    console.log(`Actual Engine: ${addresses.strategyEngine}`);
    
    if (engine.toLowerCase() === addresses.strategyEngine.toLowerCase()) {
        console.log("MATCH! ✅");
    } else {
        console.log("MISMATCH! ❌");
    }
}

main().catch(console.error);
