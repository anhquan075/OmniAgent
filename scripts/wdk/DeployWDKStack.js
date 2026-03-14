const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=== ProofVault WDK Stack — Testnet Full Deploy ===");
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);

  // --- Phase 1: Mock Assets & Oracles ---
  console.log("\n--- Phase 1: Mock Assets & Oracles ---");

  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  
  const usdt = await (await MockERC20.deploy("Tether USD", "USDT")).waitForDeployment();
  await (await usdt.setDecimals(6)).wait();
  console.log("USDT (6 dec):", await usdt.getAddress());

  const xaut = await (await MockERC20.deploy("Tether Gold", "XAUT")).waitForDeployment();
  await (await xaut.setDecimals(4)).wait();
  console.log("XAUT (4 dec):", await xaut.getAddress());

  const MockChainlink = await hre.ethers.getContractFactory("MockChainlinkAggregator");
  
  // USDT/USD Oracle (1.00)
  const usdtChainlink = await (await MockChainlink.deploy(8, hre.ethers.parseUnits("1", 8))).waitForDeployment();
  console.log("USDT/USD Chainlink:", await usdtChainlink.getAddress());

  // XAUT/USD Oracle ($2000.00 per oz)
  const xautChainlink = await (await MockChainlink.deploy(8, hre.ethers.parseUnits("2000", 8))).waitForDeployment();
  console.log("XAUT/USD Chainlink:", await xautChainlink.getAddress());

  const MockPriceOracle = await hre.ethers.getContractFactory("MockPriceOracle");
  const usdtOracle = await (await MockPriceOracle.deploy(hre.ethers.parseUnits("1", 8), deployer.address)).waitForDeployment();
  // await (await usdtOracle.lock()).wait();
  console.log("USDT Price Oracle (Mock):", await usdtOracle.getAddress());

  const xautOracle = await (await MockPriceOracle.deploy(hre.ethers.parseUnits("2000", 8), deployer.address)).waitForDeployment();
  // await (await xautOracle.lock()).wait();
  console.log("XAUT Price Oracle (Mock):", await xautOracle.getAddress());

  // --- Phase 2: Core ProofVault Stack ---
  console.log("\n--- Phase 2: Core ProofVault Stack ---");

  // Policy: Normal=10% XAUT, Guarded=50% XAUT, Drawdown=100% XAUT
  const RiskPolicy = await hre.ethers.getContractFactory("RiskPolicy");
  const policy = await (await RiskPolicy.deploy(
    300,    // cooldown
    150,    // guardedVolatilityBps
    500,    // drawdownVolatilityBps
    hre.ethers.parseUnits("0.97", 8), // depegPrice
    100,    // maxSlippageBps
    100,    // maxBountyBps
    1000,   // normalAsterBps (10% XAUT)
    5000,   // guardedAsterBps (50% XAUT)
    10000,  // drawdownAsterBps (100% XAUT)
    5,      // minBountyBps
    3600,   // auctionDuration
    500,    // idleBufferBps (5%)
    20,     // sharpeWindow
    1500,   // sharpeLowThreshold
    0,      // normalLpBps
    0,      // guardedLpBps
    0       // drawdownLpBps
  )).waitForDeployment();
  console.log("RiskPolicy:", await policy.getAddress());

  const SharpeTracker = await hre.ethers.getContractFactory("SharpeTracker");
  const sharpeTracker = await (await SharpeTracker.deploy(20)).waitForDeployment();
  console.log("SharpeTracker:", await sharpeTracker.getAddress());

  const MockStableSwap = await hre.ethers.getContractFactory("MockStableSwapPoolWithLPSupport");
  const pool = await (await MockStableSwap.deploy(
    await usdt.getAddress(),
    await xaut.getAddress(),
    hre.ethers.parseUnits("1000000", 18), // bal0
    hre.ethers.parseUnits("1000000", 18), // bal1 (1:1 ratio)
    hre.ethers.parseUnits("1", 18),
    0
  )).waitForDeployment();
  console.log("Mock StableSwap Pool:", await pool.getAddress());

  const CircuitBreaker = await hre.ethers.getContractFactory("CircuitBreaker");
  const breaker = await (await CircuitBreaker.deploy(
    await usdtChainlink.getAddress(),
    await pool.getAddress(),
    50, 100, 50, 3600, 
    999999999 // Very large stale period
  )).waitForDeployment();
  console.log("CircuitBreaker:", await breaker.getAddress());

  // --- Phase 3: Adapters ---
  console.log("\n--- Phase 3: Adapters ---");

  const XAUTYieldAdapter = await hre.ethers.getContractFactory("XAUTYieldAdapter");
  const xautAdapter = await (await XAUTYieldAdapter.deploy(
    await usdt.getAddress(),
    await xaut.getAddress(),
    await xautOracle.getAddress(),
    await usdtOracle.getAddress(),
    deployer.address
  )).waitForDeployment();
  console.log("XAUT (Safety) Adapter:", await xautAdapter.getAddress());

  const ManagedAdapter = await hre.ethers.getContractFactory("ManagedAdapter");
  const secondaryAdapter = await (await ManagedAdapter.deploy(await usdt.getAddress(), deployer.address)).waitForDeployment();
  console.log("Secondary Adapter:", await secondaryAdapter.getAddress());

  const lpAdapter = await (await ManagedAdapter.deploy(await usdt.getAddress(), deployer.address)).waitForDeployment();
  console.log("LP (Mock) Adapter:", await lpAdapter.getAddress());

  // --- Phase 4: Vault & Engine ---
  console.log("\n--- Phase 4: Vault & Engine ---");

  const ProofVault = await hre.ethers.getContractFactory("ProofVault");
  const vault = await (await ProofVault.deploy(
    await usdt.getAddress(),
    "TetherProof WDK Vault",
    "TPWDK",
    deployer.address,
    500 // 5% idle buffer
  )).waitForDeployment();
  console.log("ProofVault:", await vault.getAddress());

  const StrategyEngine = await hre.ethers.getContractFactory("StrategyEngine");
  const engine = await (await StrategyEngine.deploy(
    await vault.getAddress(),
    await policy.getAddress(),
    await usdtOracle.getAddress(),
    await breaker.getAddress(),
    await sharpeTracker.getAddress(),
    hre.ethers.parseUnits("1", 8) // initialPrice (USDT/USD)
  )).waitForDeployment();
  console.log("StrategyEngine:", await engine.getAddress());

  // --- Phase 5: Wiring & Locking ---
  console.log("\n--- Phase 5: Wiring & Locking ---");

  await (await sharpeTracker.setEngine(await engine.getAddress())).wait();
  await (await vault.setEngine(await engine.getAddress())).wait();
  await (await vault.setAdapters(
    await xautAdapter.getAddress(),
    await secondaryAdapter.getAddress(),
    await lpAdapter.getAddress()
  )).wait();

  await (await xautAdapter.setVault(await vault.getAddress())).wait();
  await (await secondaryAdapter.setVault(await vault.getAddress())).wait();
  await (await lpAdapter.setVault(await vault.getAddress())).wait();

  // Seed adapter with some XAUT so it reports value
  // In a real scenario, the adapter would buy XAUT from a pool
  await (await xaut.mint(await xautAdapter.getAddress(), hre.ethers.parseUnits("1", 4))).wait(); // 1 oz of Gold
  console.log("Seeded XAUT Adapter with 1.0 oz Gold");

  console.log("Locking configurations...");
  await (await xautAdapter.lockConfiguration()).wait();
  await (await secondaryAdapter.lockConfiguration()).wait();
  await (await lpAdapter.lockConfiguration()).wait();
  await (await vault.lockConfiguration()).wait();

  const vaultAddr = await vault.getAddress();
  const engineAddr = await engine.getAddress();
  const usdtAddr = await usdt.getAddress();
  const xautAddr = await xaut.getAddress();

  console.log("\n========================================");
  console.log("   TETHER-WDK DEPLOYMENT COMPLETE");
  console.log("========================================");
  console.log("Vault Address:  ", vaultAddr);
  console.log("Engine Address: ", engineAddr);
  console.log("USDT Address:   ", usdtAddr);
  console.log("XAUT Address:   ", xautAddr);
  console.log("\n--- WDK Agent Config ---");
  console.log(`WDK_VAULT_ADDRESS=${vaultAddr}`);
  console.log(`WDK_ENGINE_ADDRESS=${engineAddr}`);
  console.log(`WDK_USDT_ADDRESS=${usdtAddr}`);
  console.log(`WDK_XAUT_ADDRESS=${xautAddr}`);
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
