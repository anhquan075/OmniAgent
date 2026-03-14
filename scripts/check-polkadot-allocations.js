const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    console.log("Checking Allocations on Polkadot Hub...");

    const moonwellERC4626 = await ethers.getContractAt("contracts/interfaces/IManagedAdapter.sol:IManagedAdapter", addresses.moonwellERC4626Adapter);
    const beamSwapFarm = await ethers.getContractAt("contracts/interfaces/IManagedAdapter.sol:IManagedAdapter", addresses.beamSwapFarmAdapter);
    const moonwellLending = await ethers.getContractAt("contracts/interfaces/IManagedAdapter.sol:IManagedAdapter", addresses.moonwellLendingAdapter);
    const usdc = await ethers.getContractAt("IERC20", addresses.usdc);

    const primaryBal = await moonwellERC4626.managedAssets();
    const lpBal = await beamSwapFarm.managedAssets();
    const secondaryBal = await moonwellLending.managedAssets();
    const idleBal = await usdc.balanceOf(addresses.vault);

    console.log(`\nPrimary (Moonwell ERC4626): ${ethers.formatUnits(primaryBal, 6)} USDC`);
    console.log(`LP Rail (BeamSwap Farm): ${ethers.formatUnits(lpBal, 6)} USDC`);
    console.log(`Secondary (Moonwell Lending): ${ethers.formatUnits(secondaryBal, 6)} USDC`);
    console.log(`Vault Idle: ${ethers.formatUnits(idleBal, 6)} USDC`);
    
    const total = primaryBal + lpBal + secondaryBal + idleBal;
    console.log(`\nTotal Accounted: ${ethers.formatUnits(total, 6)} USDC`);
}

main().catch(console.error);
