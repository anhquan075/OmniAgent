const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Checking Vault State with account:", deployer.address);

    const addressesPath = path.join(__dirname, "../frontend/lib/moonbeamAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    const vault = await ethers.getContractAt("ProofVault", addresses.vault);
    const usdc = await ethers.getContractAt("MockUSDC", addresses.usdc);

    console.log(`Vault: ${addresses.vault}`);
    console.log(`USDC: ${addresses.usdc}`);

    try {
        console.log("Locked:", await vault.configurationLocked());
        console.log("Asset:", await vault.asset());
        console.log("Decimals:", await vault.decimals());
        console.log("TotalAssets:", await vault.totalAssets());
        console.log("Vault Balance:", await usdc.balanceOf(addresses.vault));
        console.log("Deployer Balance:", await usdc.balanceOf(deployer.address));
        console.log("Allowance:", await usdc.allowance(deployer.address, addresses.vault));
    } catch (e) {
        console.error("Error reading state:");
        console.error(e);
    }
}

main().catch(console.error);
