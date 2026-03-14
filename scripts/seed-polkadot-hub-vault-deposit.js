const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Vault Deposit on Polkadot Hub with account:", deployer.address);

    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    if (!fs.existsSync(addressesPath)) {
        console.error("Addresses file not found! Run deployment script first.");
        process.exit(1);
    }

    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    const usdc = await ethers.getContractAt("MockUSDC", addresses.usdc);
    const vault = await ethers.getContractAt("ProofVault", addresses.vault);

    // 1. Initial Deposit
    console.log("\n--- Executing Initial Deposit ---");
    const depositAmount = ethers.parseUnits("100", 6); // 100 USDC
    
    await (await usdc.mint(deployer.address, depositAmount)).wait();
    console.log(`Minted ${ethers.formatUnits(depositAmount, 6)} USDC to deployer`);

    await (await usdc.approve(addresses.vault, ethers.MaxUint256)).wait();
    console.log(`Approved vault to spend USDC`);

    const tx = await vault.deposit(depositAmount, deployer.address);
    await tx.wait();
    console.log(`Successfully deposited 100 USDC into ProofVault`);

    const shares = await vault.balanceOf(deployer.address);
    console.log(`Current shares: ${ethers.formatUnits(shares, 12)} apUSDC`); // Shares have 12 decimals (6 assets + 6 offset)

    console.log("\nVault Seeding Complete! ✅");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
