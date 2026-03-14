const hre = require("hardhat");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function envOrDefault(name, defaultValue) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  // Required addresses
  const asset = requiredEnv("V2_ASSET_ADDRESS");
  const asterMinter = requiredEnv("V2_MINTER_ADDRESS");
  const stableSwapPool = requiredEnv("V2_STABLESWAP_POOL");
  const chainlinkFeed = requiredEnv("V2_CHAINLINK_FEED");
  const usdf = requiredEnv("V2_USDF_ADDRESS");
  const usdfMinting = requiredEnv("V2_USDF_MINTING_ADDRESS");

  // Adapter selectors
  const depositSelector = envOrDefault("V2_DEPOSIT_SELECTOR", "0xb6b55f25");
  const managedAssetsSelector = envOrDefault("V2_MANAGED_ASSETS_SELECTOR", "0xad1728cb");
  const requestWithdrawSelector = envOrDefault("V2_REQUEST_WITHDRAW_SELECTOR", "0x9ee679e8");
  const claimWithdrawSelector = envOrDefault("V2_CLAIM_WITHDRAW_SELECTOR", "0x712679e8");
  const getWithdrawRequestSelector = envOrDefault("V2_GET_WITHDRAW_REQUEST_SELECTOR", "0x88d5b31a");

  // Oracle mode
  const oracleMode = envOrDefault("ORACLE_MODE", "chainlink").toLowerCase();
  const initialPrice = hre.ethers.parseUnits(envOrDefault("V2_INITIAL_PRICE", "1"), 8);

  // V1 policy params
  const cooldown = Number(envOrDefault("V2_POLICY_COOLDOWN", "300"));
  const guardedVolBps = Number(envOrDefault("V2_POLICY_GUARDED_VOL_BPS", "150"));
  const drawdownVolBps = Number(envOrDefault("V2_POLICY_DRAWDOWN_VOL_BPS", "500"));
  const depegPrice = hre.ethers.parseUnits(envOrDefault("V2_POLICY_DEPEG_PRICE", "0.97"), 8);
  const maxSlippageBps = Number(envOrDefault("V2_POLICY_MAX_SLIPPAGE_BPS", "100"));
  const maxBountyBps = Number(envOrDefault("V2_POLICY_MAX_BOUNTY_BPS", "100"));
  const normalAsterBps = Number(envOrDefault("V2_POLICY_NORMAL_ASTER_BPS", "6000"));
  const guardedAsterBps = Number(envOrDefault("V2_POLICY_GUARDED_ASTER_BPS", "5000"));
  const drawdownAsterBps = Number(envOrDefault("V2_POLICY_DRAWDOWN_ASTER_BPS", "7000"));

  // V2 policy params
  const minBountyBps = Number(envOrDefault("V2_POLICY_MIN_BOUNTY_BPS", "5"));
  const auctionDurationSeconds = Number(envOrDefault("V2_POLICY_AUCTION_DURATION", "3600"));
  const idleBufferBps = Number(envOrDefault("V2_POLICY_IDLE_BUFFER_BPS", "500"));
  const sharpeWindowSize = Number(envOrDefault("V2_POLICY_SHARPE_WINDOW_SIZE", "20"));
  const sharpeLowThreshold = Number(envOrDefault("V2_POLICY_SHARPE_LOW_THRESHOLD", "5000"));

  // CircuitBreaker params
  const signalAThresholdBps = Number(envOrDefault("V2_BREAKER_SIGNAL_A_BPS", "50"));
  const signalBThresholdBps = Number(envOrDefault("V2_BREAKER_SIGNAL_B_BPS", "100"));
  const signalCThresholdBps = Number(envOrDefault("V2_BREAKER_SIGNAL_C_BPS", "50"));
  const recoveryCooldown = Number(envOrDefault("V2_BREAKER_RECOVERY_COOLDOWN", "3600"));

  // PegArbExecutor params
  const minProfitBps = Number(envOrDefault("V2_ARB_MIN_PROFIT_BPS", "10"));
  const maxArbBps = Number(envOrDefault("V2_ARB_MAX_SIZE_BPS", "500"));
  const arbBountyBps = Number(envOrDefault("V2_ARB_BOUNTY_BPS", "50"));
  const deviationThresholdBps = Number(envOrDefault("V2_ARB_DEVIATION_THRESHOLD_BPS", "50"));

  console.log("=== Deploying ProofVault V2 stack ===");
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);

  // 1. RiskPolicy
  console.log("\n[1/9] Deploying RiskPolicy...");
  const RiskPolicy = await hre.ethers.getContractFactory("RiskPolicy");
  const policy = await RiskPolicy.deploy(
    cooldown,
    guardedVolBps,
    drawdownVolBps,
    depegPrice,
    maxSlippageBps,
    maxBountyBps,
    normalAsterBps,
    guardedAsterBps,
    drawdownAsterBps,
    minBountyBps,
    auctionDurationSeconds,
    idleBufferBps,
    sharpeWindowSize,
    sharpeLowThreshold,
    0, // normalLpBps (no LP rail in this deploy script)
    0, // guardedLpBps
    0  // drawdownLpBps
  );
  await policy.waitForDeployment();
  console.log("RiskPolicy:", await policy.getAddress());

  // 2. Oracle
  console.log("\n[2/9] Deploying oracle...");
  let oracle;
  if (oracleMode === "chainlink") {
    const staleSeconds = Number(envOrDefault("V2_ORACLE_STALE_SECONDS", "7200"));
    const ChainlinkPriceOracle = await hre.ethers.getContractFactory("ChainlinkPriceOracle");
    oracle = await ChainlinkPriceOracle.deploy(chainlinkFeed, staleSeconds);
    await oracle.waitForDeployment();
  } else {
    const MockPriceOracle = await hre.ethers.getContractFactory("MockPriceOracle");
    oracle = await MockPriceOracle.deploy(initialPrice, deployer.address);
    await oracle.waitForDeployment();
  }
  console.log("Oracle:", await oracle.getAddress());

  // 3. CircuitBreaker
  console.log("\n[3/9] Deploying CircuitBreaker...");
  const CircuitBreaker = await hre.ethers.getContractFactory("CircuitBreaker");
  const breaker = await CircuitBreaker.deploy(
    chainlinkFeed,
    stableSwapPool,
    signalAThresholdBps,
    signalBThresholdBps,
    signalCThresholdBps,
    recoveryCooldown,
    0 // chainlinkStalePeriod (0 = default 3600)
  );
  await breaker.waitForDeployment();
  console.log("CircuitBreaker:", await breaker.getAddress());

  // 4. SharpeTracker
  console.log("\n[4/9] Deploying SharpeTracker...");
  const SharpeTracker = await hre.ethers.getContractFactory("SharpeTracker");
  const sharpeTracker = await SharpeTracker.deploy(sharpeWindowSize);
  await sharpeTracker.waitForDeployment();
  console.log("SharpeTracker:", await sharpeTracker.getAddress());

  // 5. AsterEarnAdapter
  console.log("\n[5/9] Deploying AsterEarnAdapter...");
  const AsterEarnAdapter = await hre.ethers.getContractFactory("AsterEarnAdapter");
  const asterAdapter = await AsterEarnAdapter.deploy(
    asset,
    asterMinter,
    depositSelector,
    managedAssetsSelector,
    requestWithdrawSelector,
    claimWithdrawSelector,
    getWithdrawRequestSelector,
    deployer.address
  );
  await asterAdapter.waitForDeployment();
  console.log("AsterEarnAdapter:", await asterAdapter.getAddress());

  // 6. ManagedAdapter (secondary)
  console.log("\n[6/9] Deploying ManagedAdapter (secondary)...");
  const ManagedAdapter = await hre.ethers.getContractFactory("ManagedAdapter");
  const secondaryAdapter = await ManagedAdapter.deploy(asset, deployer.address);
  await secondaryAdapter.waitForDeployment();
  console.log("ManagedAdapter:", await secondaryAdapter.getAddress());

  // 7. ProofVault
  console.log("\n[7/9] Deploying ProofVault...");
  const ProofVault = await hre.ethers.getContractFactory("ProofVault");
  const vault = await ProofVault.deploy(
    asset,
    "AsterPilot ProofVault V2 Share",
    "apvV2SHARE",
    deployer.address,
    idleBufferBps
  );
  await vault.waitForDeployment();
  console.log("ProofVault:", await vault.getAddress());

  // 8. StrategyEngine
  console.log("\n[8/9] Deploying StrategyEngine...");
  const StrategyEngine = await hre.ethers.getContractFactory("StrategyEngine");
  const engine = await StrategyEngine.deploy(
    await vault.getAddress(),
    await policy.getAddress(),
    await oracle.getAddress(),
    await breaker.getAddress(),
    await sharpeTracker.getAddress(),
    initialPrice
  );
  await engine.waitForDeployment();
  console.log("StrategyEngine:", await engine.getAddress());

  // Set engine on SharpeTracker (one-time)
  await (await sharpeTracker.setEngine(await engine.getAddress())).wait();
  console.log("SharpeTracker engine set.");
  console.log("StrategyEngine:", await engine.getAddress());

  // 9. PegArbExecutor
  console.log("\n[9/9] Deploying PegArbExecutor...");
  const PegArbExecutor = await hre.ethers.getContractFactory("PegArbExecutor");
  const pegArb = await PegArbExecutor.deploy(
    await vault.getAddress(),
    asset,
    usdf,
    usdfMinting,
    stableSwapPool,
    minProfitBps,
    maxArbBps,
    arbBountyBps,
    deviationThresholdBps
  );
  await pegArb.waitForDeployment();
  console.log("PegArbExecutor:", await pegArb.getAddress());

  // Wiring
  console.log("\n=== Wiring contracts ===");
  await (await vault.setEngine(await engine.getAddress())).wait();
  console.log("Vault.setEngine() ✓");

  await (await vault.setAdapters(await asterAdapter.getAddress(), await secondaryAdapter.getAddress())).wait();
  console.log("Vault.setAdapters() ✓");

  await (await vault.setPegArbExecutor(await pegArb.getAddress())).wait();
  console.log("Vault.setPegArbExecutor() ✓ (USDT approval for arb trades)");

  await (await asterAdapter.setVault(await vault.getAddress())).wait();
  console.log("AsterAdapter.setVault() ✓");

  await (await secondaryAdapter.setVault(await vault.getAddress())).wait();
  console.log("SecondaryAdapter.setVault() ✓");

  // Locking
  console.log("\n=== Locking configurations ===");
  await (await asterAdapter.lockConfiguration()).wait();
  console.log("AsterAdapter.lockConfiguration() ✓");

  await (await secondaryAdapter.lockConfiguration()).wait();
  console.log("SecondaryAdapter.lockConfiguration() ✓");

  if (oracleMode !== "chainlink") {
    await (await oracle.lock()).wait();
    console.log("Oracle.lock() ✓");
  }

  await (await vault.lockConfiguration()).wait();
  console.log("Vault.lockConfiguration() ✓");

  // Verification
  console.log("\n=== DEPLOYMENT SUMMARY ===");
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("Asset (USDT):", asset);
  console.log("USDF:", usdf);
  console.log("USDF Minting:", usdfMinting);
  console.log("Aster Minter:", asterMinter);
  console.log("StableSwap Pool:", stableSwapPool);
  console.log("Chainlink Feed:", chainlinkFeed);
  console.log("\nCore Contracts:");
  console.log("  Vault:", await vault.getAddress());
  console.log("  Engine:", await engine.getAddress());
  console.log("  Policy:", await policy.getAddress());
  console.log("  Oracle:", await oracle.getAddress());
  console.log("  CircuitBreaker:", await breaker.getAddress());
  console.log("  SharpeTracker:", await sharpeTracker.getAddress());
  console.log("  AsterAdapter:", await asterAdapter.getAddress());
  console.log("  SecondaryAdapter:", await secondaryAdapter.getAddress());
  console.log("  PegArbExecutor:", await pegArb.getAddress());
  console.log("\nVerification (all should be zero/true):");
  console.log("  Vault owner:", await vault.owner());
  console.log("  AsterAdapter owner:", await asterAdapter.owner());
  console.log("  SecondaryAdapter owner:", await secondaryAdapter.owner());
  if (oracleMode === "chainlink") {
    console.log("  Oracle locked:", await oracle.locked());
  } else {
    console.log("  Oracle owner:", await oracle.owner());
  }
  console.log("\n✅ Deployment complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
