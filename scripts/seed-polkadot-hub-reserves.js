const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Seeding Polkadot Hub Testnet Reserves with account:", deployer.address);

    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    if (!fs.existsSync(addressesPath)) {
        console.error("Addresses file not found! Run deployment script first.");
        process.exit(1);
    }

    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    const usdc = await ethers.getContractAt("MockUSDC", addresses.usdc);
    const glint = await ethers.getContractAt("MockGLINTToken", addresses.glint);
    
    // Use the stableSwap as our router/pool
    const stableSwap = await ethers.getContractAt("MockStableSwapPool", addresses.mocks.stableSwap);
    const moonwell = await ethers.getContractAt("MockMoonwellVault", addresses.mocks.moonwellVault);

    // 1. Seed StableSwap Pool
    console.log("\n--- Seeding StableSwap Pool ---");
    const seedAmount = ethers.parseUnits("1000000", 6);
    await (await usdc.mint(deployer.address, seedAmount)).wait();
    console.log("Minted 1M USDC to deployer");
    
    await (await usdc.approve(addresses.mocks.stableSwap, seedAmount)).wait();
    console.log("Approved StableSwap Pool");
    
    const amounts = [seedAmount, seedAmount];
    console.log("Setting mock pool balances to 1M/1M...");
    await (await stableSwap.setBalances(seedAmount, seedAmount)).wait();
    console.log("Mock pool balances set.");

    // 2. Seed Moonwell Vault
    console.log("\n--- Seeding Moonwell Vault ---");
    const moonwellSeed = ethers.parseUnits("100000", 6);
    await (await usdc.mint(addresses.mocks.moonwellVault, moonwellSeed)).wait();
    console.log("Seeded Moonwell Vault with 100k USDC");

    // 3. Seed GLINT for Farm
    console.log("\n--- Seeding GLINT for Farm ---");
    const glintSeed = ethers.parseUnits("1000000", 18);
    await (await glint.mint(deployer.address, glintSeed)).wait();
    console.log("Minted 1M GLINT rewards to deployer");

    console.log("\nReserves Seeding Complete! ✅");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
