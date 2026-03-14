const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await ethers.getSigners();
    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    console.log("Fixing MasterChef pool registration...");
    
    // Use the latest masterChef and stableSwap from the root contracts object
    const masterChef = await ethers.getContractAt("MockMasterChef", addresses.masterChef);
    const stableSwap = addresses.stableSwap;

    console.log(`MasterChef: ${addresses.masterChef}`);
    console.log(`Pool LP (StableSwap): ${stableSwap}`);

    const tx = await masterChef.addPool(stableSwap);
    console.log(`Transaction sent: ${tx.hash}`);
    await tx.wait();
    
    console.log("Pool added successfully! ✅");
}

main().catch(console.error);
