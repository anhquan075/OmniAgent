const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Starting Stress Test on Polkadot Hub with account:", deployer.address);

    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8")).contracts;

    const vault = await ethers.getContractAt("ProofVault", addresses.vault);
    const usdc = await ethers.getContractAt("IERC20", addresses.usdc);

    const depositAmount = ethers.parseUnits("1.0", 6); // 1 USDC
    const iterations = 10; // Reducing to 10 for testnet stability/speed in this demo
    
    console.log(`Minting ${iterations} USDC for stress test...`);
    // Assuming deployer has permission to mint mock USDC if it's a mock
    try {
        const mockUsdc = await ethers.getContractAt("MockUSDC", addresses.usdc);
        await mockUsdc.mint(deployer.address, depositAmount * BigInt(iterations));
    } catch (e) {
        console.log("Note: Mock minting skipped, assuming existing balance.");
    }

    console.log("Approving vault...");
    await usdc.approve(addresses.vault, depositAmount * BigInt(iterations));

    console.log(`Executing ${iterations} sequential deposits...`);
    let successCount = 0;
    
    for (let i = 0; i < iterations; i++) {
        try {
            console.log(`Deposit ${i+1}/${iterations}...`);
            const tx = await vault.deposit(depositAmount, deployer.address);
            await tx.wait();
            successCount++;
            console.log(`  ✅ Success: ${tx.hash}`);
        } catch (e) {
            console.error(`  ❌ Failed at deposit ${i+1}:`, e.message);
        }
    }

    console.log(`\nStress Test Complete!`);
    console.log(`Success Rate: ${(successCount / iterations) * 100}% (${successCount}/${iterations})`);
    
    if (successCount === iterations) {
        console.log("✅ All deposits succeeded!");
    } else {
        console.log("⚠ Some deposits failed. Check gas/nonce issues.");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
