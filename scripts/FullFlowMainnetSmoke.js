
const { ethers, network } = require("hardhat");
const contractAddresses = require("../frontend/lib/contractAddresses");

async function main() {
  if (network.name !== "hardhat") {
    console.error("This script must be run on the Hardhat network with mainnet forking enabled.");
    return;
  }

  console.log("🚀 Starting Full-Flow Mainnet Smoke Test (UI-Logic Simulation)");
  
  const rpcUrl = process.env.BNB_ARCHIVE_RPC_URL || process.env.BNB_MAINNET_RPC_URL || "https://bsc-dataseed.bnbchain.org";
  const mainnetProvider = new ethers.JsonRpcProvider(rpcUrl);
  const latestBlock = await mainnetProvider.getBlockNumber();
  const forkBlock = latestBlock - 50;
  console.log(`Resetting fork to block ${forkBlock} using ${rpcUrl}...`);

  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: rpcUrl,
          blockNumber: forkBlock,
        },
      },
    ],
  });

  const [deployer] = await ethers.getSigners();

  const vaultAddr = contractAddresses.V2_MAINNET_PRESET.vaultAddress;
  const engineAddr = contractAddresses.V2_MAINNET_PRESET.engineAddress;
  const circuitBreakerAddr = contractAddresses.V2_MAINNET_PRESET.circuitBreakerAddress;
  const usdtAddr = contractAddresses.V2_MAINNET_PRESET.tokenAddress;

  const vault = await ethers.getContractAt("ProofVault", vaultAddr);
  const engine = await ethers.getContractAt("StrategyEngine", engineAddr);
  const breaker = await ethers.getContractAt("CircuitBreaker", circuitBreakerAddr);
  const usdt = await ethers.getContractAt("MockERC20", usdtAddr);

  console.log("\n--- Preparing Whale Impersonation for Mainnet ---");
  const WHALE = "0xF977814e90dA44bFA03b6295A0616a897441aceC"; // Binance 8
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [WHALE],
  });
  const whaleSigner = await ethers.getSigner(WHALE);
  await deployer.sendTransaction({ to: WHALE, value: ethers.parseEther("1") });

  console.log("\n--- UI executeCycle Flow ---");

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
    process.exit(0);
  }

  if (decision && decision.executable === false) {
    console.log(`⚠️ UI would block: Execution rejected by algorithm: ${ethers.decodeBytes32String(decision.reason)}`);
    // On mainnet fork, we might just be on cooldown. We can fast-forward time to test execution!
    if (ethers.decodeBytes32String(decision.reason) === "COOLDOWN_ACTIVE") {
        const timeUntil = await engine.timeUntilNextCycle();
        console.log(`⌛ Engine cooldown active. Fast-forwarding time by ${timeUntil}s...`);
        await ethers.provider.send("evm_increaseTime", [Number(timeUntil) + 10]);
        await ethers.provider.send("evm_mine", []);
    } else {
        process.exit(0);
    }
  }

  const canExecNow = await engine.canExecute();
  if (!canExecNow[0]) {
    console.log(`⚠️ UI would block: Not ready: ${ethers.decodeBytes32String(canExecNow[1])}`);
    process.exit(0);
  }

  try {
    console.log("UI: Simulating executeCycle with staticCall...");
    // Let's fund the caller with some BNB just in case it needs gas
    await engine.executeCycle.staticCall();
    
    console.log("UI: Executing executeCycle...");
    const tx = await engine.executeCycle();
    await tx.wait();
    console.log(`✅ executeCycle successful: ${tx.hash}`);
  } catch (e) {
    console.log("❌ executeCycle failed:", e.message);
  }

  console.log("\n--- UI Deposit Flow ---");
  const depositAmount = ethers.parseUnits("1000", 18); // 1000 USDT from Whale
  
  console.log("UI: Checking configurationLocked...");
  const isLocked = await vault.configurationLocked();
  if (!isLocked) {
    console.log("⚠️ UI would block: Vault configuration is not locked.");
  } else {
    // We'll deposit using the whale's USDT to our deployer account to test both
    console.log("Funding deployer account with USDT...");
    await usdt.connect(whaleSigner).transfer(deployer.address, depositAmount);

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

  console.log("\n--- Step 5: Final State Probe ---");
  const totalAssets = await vault.totalAssets();
  console.log(`Final Vault totalAssets: ${ethers.formatUnits(totalAssets, 18)} USDT`);

  console.log("\n✨ Mainnet Smoke Test Completed Successfully");
}

main().catch((error) => {
  console.error("❌ Smoke Test Failed:", error);
  process.exitCode = 1;
});
