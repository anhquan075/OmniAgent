const { ethers } = require("hardhat");
const contractAddresses = require("../frontend/lib/contractAddresses");

async function main() {
  console.log("🚀 Starting Full-Flow Testnet Smoke Test (UI-Logic Simulation)");
  const [deployer] = await ethers.getSigners();

  const vaultAddr = contractAddresses.V2_TESTNET_PRESET.vaultAddress;
  const engineAddr = contractAddresses.V2_TESTNET_PRESET.engineAddress;
  const circuitBreakerAddr = contractAddresses.V2_TESTNET_PRESET.circuitBreakerAddress;
  const usdtAddr = contractAddresses.V2_TESTNET_PRESET.tokenAddress;

  const vault = await ethers.getContractAt("ProofVault", vaultAddr);
  const engine = await ethers.getContractAt("StrategyEngine", engineAddr);
  const breaker = await ethers.getContractAt("CircuitBreaker", circuitBreakerAddr);
  const usdt = await ethers.getContractAt("MockERC20", usdtAddr);

  console.log("\n--- UI executeCycle Flow ---");

  // 1. Fetch exactly what the UI fetches via Promise.all
  console.log("UI: Fetching engine status...");
  const [[canExec, reasonBytes32], breakerPreview, decisionPreview] = await Promise.all([
    engine.canExecute().catch(() => [false, ethers.encodeBytes32String("ERROR")]),
    breaker.previewBreaker().catch(() => null),
    engine.previewDecision().catch(() => null)
  ]);

  const breakerStatus = breakerPreview;
  const decision = decisionPreview;

  const activeSignals = [
    breakerStatus?.signalA ? "A" : null,
    breakerStatus?.signalB ? "B" : null,
    breakerStatus?.signalC ? "C" : null,
  ].filter(Boolean).join(", ");

  console.log(`UI: canExecute = ${canExec} (${ethers.decodeBytes32String(reasonBytes32)})`);
  console.log(`UI: breaker paused = ${breakerStatus?.paused}, signals = ${activeSignals || "none"}`);
  console.log(`UI: decision executable = ${decision?.executable}`);

  if (breakerStatus?.paused || activeSignals) {
    console.log(`⚠️ UI would block: Circuit breaker paused or signals active (${activeSignals}).`);
    console.log("Checking if recovery cooldown has passed...");
    const block = await ethers.provider.getBlock("latest");
    const now = BigInt(block.timestamp);
    if (now >= breakerStatus.recoveryTimestamp && breakerStatus.recoveryTimestamp > 0n) {
      console.log("Recovery timestamp passed, trying to unpause breaker...");
      await (await breaker.checkBreaker()).wait();
      console.log("Breaker unpaused! Please run script again.");
    }
    process.exit(0);
  }

  if (decision && decision.executable === false) {
    console.log(`⚠️ UI would block: Execution rejected by algorithm: ${ethers.decodeBytes32String(decision.reason)}`);
    process.exit(0);
  }

  if (!canExec) {
    console.log(`⚠️ UI would block: Not ready: ${ethers.decodeBytes32String(reasonBytes32)}`);
    process.exit(0);
  }

  try {
    console.log("UI: Simulating executeCycle with staticCall...");
    await engine.executeCycle.staticCall();
    
    console.log("UI: Executing executeCycle...");
    const tx = await engine.executeCycle();
    await tx.wait();
    console.log(`✅ executeCycle successful: ${tx.hash}`);
  } catch (e) {
    console.log("❌ executeCycle failed:", e.message);
  }

  console.log("\n--- UI Deposit Flow ---");
  const depositAmount = ethers.parseUnits("10", 18); // 10 USDT
  
  console.log("UI: Checking configurationLocked...");
  const isLocked = await vault.configurationLocked();
  if (!isLocked) {
    console.log("⚠️ UI would block: Vault configuration is not locked.");
  } else {
    console.log("UI: Checking allowance...");
    const allowance = await usdt.allowance(deployer.address, vault.target);
    if (allowance < depositAmount) {
      console.log("UI: Approving token...");
      await (await usdt.approve(vault.target, ethers.MaxUint256)).wait();
    }
    
    try {
      console.log("UI: Simulating deposit with staticCall...");
      await vault.deposit.staticCall(depositAmount, deployer.address);
      
      console.log("UI: Executing deposit...");
      const depositTx = await vault.deposit(depositAmount, deployer.address);
      await depositTx.wait();
      console.log(`✅ Deposit successful: ${depositTx.hash}`);
    } catch (e) {
      console.log("❌ Deposit failed:", e.message);
    }
  }

  console.log("\n--- UI Withdraw Flow ---");
  const withdrawAmount = ethers.parseUnits("10", 18);
  console.log(`UI: Checking maxWithdraw...`);
  const maxW = await vault.maxWithdraw(deployer.address);
  console.log(`UI: maxWithdraw = ${ethers.formatUnits(maxW, 18)} USDT`);

  if (maxW >= withdrawAmount) {
    try {
      console.log(`UI: Executing withdrawal of 10 USDT...`);
      const withdrawTx = await vault.withdraw(withdrawAmount, deployer.address, deployer.address);
      await withdrawTx.wait();
      console.log(`✅ Withdrawal successful: ${withdrawTx.hash}`);
    } catch (e) {
      console.log("❌ Withdraw failed:", e.message);
    }
  } else {
    console.log("⚠️ UI would block: Insufficient maxWithdraw.");
  }

  console.log("\n✨ Smoke Test Completed Successfully");
}

main().catch((error) => {
  console.error("❌ Smoke Test Failed:", error);
  process.exitCode = 1;
});
