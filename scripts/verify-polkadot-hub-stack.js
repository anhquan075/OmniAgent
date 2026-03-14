const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Verifying Polkadot Hub Stack with account:", deployer.address);

    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    if (!fs.existsSync(addressesPath)) {
        console.error("Addresses file not found! Run deployment script first.");
        process.exit(1);
    }

    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    const vault = await ethers.getContractAt("ProofVault", addresses.vault);
    const engine = await ethers.getContractAt("StrategyEngine", addresses.strategyEngine);
    const usdc = await ethers.getContractAt("MockUSDC", addresses.usdc);

    console.log("\n--- Checking Initial State ---");
    const totalAssets = await vault.totalAssets();
    const vaultIdle = await usdc.balanceOf(addresses.vault);
    console.log(`Total Assets: ${ethers.formatUnits(totalAssets, 6)} USDC`);
    console.log(`Vault Idle: ${ethers.formatUnits(vaultIdle, 6)} USDC`);

    console.log("\n--- Checking Executability ---");
    const [canExec, reason] = await engine.canExecute();
    console.log(`Can Execute: ${canExec}, Reason: ${reason}`);

    if (canExec) {
        console.log("\n--- Executing Cycle ---");
        const tx = await engine.executeCycle();
        console.log(`Cycle transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`Cycle executed! Gas used: ${receipt.gasUsed.toString()}`);

        console.log("\n--- Checking Final Allocations ---");
        const primaryBal = await (await ethers.getContractAt("contracts/interfaces/IManagedAdapter.sol:IManagedAdapter", addresses.moonwellERC4626Adapter)).managedAssets();
        const lpRailBal = await (await ethers.getContractAt("contracts/interfaces/IManagedAdapter.sol:IManagedAdapter", addresses.moonwellLendingAdapter)).managedAssets();
        const secondaryBal = await (await ethers.getContractAt("contracts/interfaces/IManagedAdapter.sol:IManagedAdapter", addresses.beamSwapFarmAdapter)).managedAssets();
        
        console.log(`Primary (Moonwell ERC4626): ${ethers.formatUnits(primaryBal, 6)} USDC`);
        console.log(`LP Rail (Moonwell Lending): ${ethers.formatUnits(lpRailBal, 6)} USDC`);
        console.log(`Secondary (BeamSwap Farm): ${ethers.formatUnits(secondaryBal, 6)} USDC`);
    } else {
        console.log("\nCycle not ready yet. Possibly in cooldown.");
    }

    console.log("\nVerification Complete! ✅");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
