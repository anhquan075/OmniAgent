const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    console.log("Current Allocations on Polkadot Hub:");
    
    const aster = await (await ethers.getContractAt("contracts/interfaces/IManagedAdapter.sol:IManagedAdapter", addresses.moonwellERC4626Adapter)).managedAssets();
    const lp = await (await ethers.getContractAt("contracts/interfaces/IManagedAdapter.sol:IManagedAdapter", addresses.moonwellLendingAdapter)).managedAssets();
    const sec = await (await ethers.getContractAt("contracts/interfaces/IManagedAdapter.sol:IManagedAdapter", addresses.beamSwapFarmAdapter)).managedAssets();
    const vault = await (await ethers.getContractAt("ProofVault", addresses.vault)).totalAssets();
    
    console.log(`- Aster (Primary): ${ethers.formatUnits(aster, 6)} USDC`);
    console.log(`- LP (Secondary): ${ethers.formatUnits(lp, 6)} USDC`);
    console.log(`- Farm (Yield): ${ethers.formatUnits(sec, 6)} USDC`);
    console.log(`- Vault Total: ${ethers.formatUnits(vault, 6)} USDC`);
}

main().catch(console.error);
