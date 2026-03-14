const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Testing Withdrawal on Polkadot Hub with account:", deployer.address);

    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    const vault = await ethers.getContractAt("ProofVault", addresses.vault);
    const usdc = await ethers.getContractAt("IERC20", addresses.usdc);

    const shares = await vault.balanceOf(deployer.address);
    console.log(`Current shares: ${ethers.formatUnits(shares, 12)} apUSDC`); // 18 - 6 offset = 12

    if (shares === 0n) {
        console.log("❌ No shares to withdraw. Run deposit script first.");
        return;
    }

    const withdrawShares = shares / 100n; // 1%
    console.log(`Withdrawing 1%: ${ethers.formatUnits(withdrawShares, 12)} apUSDC`);

    const balanceBefore = await usdc.balanceOf(deployer.address);
    console.log(`USDC Balance Before: ${ethers.formatUnits(balanceBefore, 6)} USDC`);

    console.log("Redeeming shares...");
    const tx = await vault.redeem(withdrawShares, deployer.address, deployer.address);
    await tx.wait();
    console.log("Redemption tx:", tx.hash);

    const balanceAfter = await usdc.balanceOf(deployer.address);
    console.log(`USDC Balance After: ${ethers.formatUnits(balanceAfter, 6)} USDC`);

    if (balanceAfter > balanceBefore) {
        console.log("✅ Withdrawal successful!");
    } else {
        console.log("❌ Withdrawal failed. Balance did not increase.");
    }

    console.log("Withdrawal Test Complete! ✅");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
