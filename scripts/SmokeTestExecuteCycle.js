const { ethers } = require("hardhat");
const contractAddresses = require("../frontend/lib/contractAddresses");

async function main() {
  const engineAddr = contractAddresses.V2_TESTNET_PRESET.engineAddress;
  const vaultAddr = contractAddresses.V2_TESTNET_PRESET.vaultAddress;

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const engine = await ethers.getContractAt("StrategyEngine", engineAddr);
  const vault = await ethers.getContractAt("ProofVault", vaultAddr);

  console.log("\n--- Pre-Execution Check ---");
  const canExec = await engine.canExecute();
  console.log(
    "Can Execute:",
    canExec[0],
    ethers.decodeBytes32String(canExec[1])
  );

  if (!canExec[0]) {
    console.error(
      "Engine is not ready for execution. Reason:",
      ethers.decodeBytes32String(canExec[1])
    );
    process.exit(1);
  }

  const cycleBefore = await engine.cycleCount();
  console.log("Cycle Count Before:", cycleBefore.toString());

  console.log("\nExecuting cycle...");
  try {
    const tx = await engine.executeCycle();
    console.log("Transaction sent:", tx.hash);

    const receipt = await tx.wait();
    console.log("Transaction mined in block:", receipt.blockNumber);

    const cycleAfter = await engine.cycleCount();
    console.log("Cycle Count After:", cycleAfter.toString());

    if (cycleAfter > cycleBefore) {
      console.log("\n✓ executeCycle smoke test SUCCESSFUL");
    } else {
      console.error(
        "\n✖ executeCycle smoke test FAILED: cycleCount did not increment"
      );
      process.exit(1);
    }

    const totalAssets = await vault.totalAssets();
    console.log(
      "Total Assets After:",
      ethers.formatUnits(totalAssets, 18),
      "USDT"
    );
  } catch (error) {
    console.error("\n✖ executeCycle smoke test FAILED with error:");
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
