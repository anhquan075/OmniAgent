import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../src/utils/logger";

async function main() {
  const [deployer] = await ethers.getSigners();
  logger.info("Starting Full Stack Deployment with Seed Data...");
  logger.info(`Network: ${(await ethers.provider.getNetwork()).name}`);
  logger.info(`Deployer: ${deployer.address}`);

  // 1. Deploy Mock Assets
  logger.info("\n--- Phase 1: Mock Assets ---");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdt = await (await MockERC20.deploy("Tether USD", "USDT")).waitForDeployment();
  await (await usdt.setDecimals(6)).wait();
  const usdtAddr = await usdt.getAddress();
  logger.info(`USDT (6 dec): ${usdtAddr}`);

  const xaut = await (await MockERC20.deploy("Tether Gold", "XAUT")).waitForDeployment();
  await (await xaut.setDecimals(4)).wait();
  const xautAddr = await xaut.getAddress();
  logger.info(`XAUT (4 dec): ${xautAddr}`);

  // 2. Deploy Mock Oracles
  logger.info("\n--- Phase 2: Oracles ---");
  const MockChainlink = await ethers.getContractFactory("MockChainlinkAggregator");
  const usdtChainlink = await (await MockChainlink.deploy(8, ethers.parseUnits("1", 8))).waitForDeployment();
  const xautChainlink = await (await MockChainlink.deploy(8, ethers.parseUnits("2000", 8))).waitForDeployment();
  
  const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
  const usdtOracle = await (await MockPriceOracle.deploy(ethers.parseUnits("1", 8), deployer.address)).waitForDeployment();
  const xautOracle = await (await MockPriceOracle.deploy(ethers.parseUnits("2000", 8), deployer.address)).waitForDeployment();
  const usdtOracleAddr = await usdtOracle.getAddress();
  const xautOracleAddr = await xautOracle.getAddress();
  logger.info(`USDT Oracle: ${usdtOracleAddr}`);
  logger.info(`XAUT Oracle: ${xautOracleAddr}`);

  // 3. Deploy Core Stack
  logger.info("\n--- Phase 3: Core Stack ---");
  const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
  const policy = await (await RiskPolicy.deploy(
    300,              // cooldown
    150,              // guardedVolatilityBps
    500,              // drawdownVolatilityBps
    ethers.parseUnits("0.97", 8), // depegPrice
    100,              // maxSlippageBps
    100,              // maxBountyBps
    1000,             // normalWDKBps (10%)
    5000,             // guardedWDKBps (50%)
    9500,             // drawdownWDKBps (95%) - reduced from 10000 to allow 5% LP
    5,                // minBountyBps
    3600,             // auctionDurationSeconds
    500,              // idleBufferBps
    20,               // sharpeWindowSize
    1500,             // sharpeLowThreshold
    1000,             // normalLpBps (10%)
    1000,             // guardedLpBps (10%)
    500,              // drawdownLpBps (5%)
    3000,             // maxAaveAllocationBps (30%) - updated per plan
    ethers.parseUnits("1.5", 18)  // minHealthFactor: 1.5
  )).waitForDeployment();
  logger.info(`RiskPolicy: ${await policy.getAddress()}`);
  
  const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
  const sharpeTracker = await (await SharpeTracker.deploy(20)).waitForDeployment();
  logger.info(`SharpeTracker: ${await sharpeTracker.getAddress()}`);

  const MockStableSwap = await ethers.getContractFactory("MockStableSwapPoolWithLPSupport");
  const pool = await (await MockStableSwap.deploy(
    usdtAddr, xautAddr, ethers.parseUnits("1000000", 18), ethers.parseUnits("1000000", 18), ethers.parseUnits("1", 18), 0
  )).waitForDeployment();
  logger.info(`Mock StableSwap Pool: ${await pool.getAddress()}`);

  const CircuitBreaker = await ethers.getContractFactory("CircuitBreaker");
  const breaker = await (await CircuitBreaker.deploy(
    await usdtChainlink.getAddress(), await pool.getAddress(), 50, 100, 50, 3600, 999999999
  )).waitForDeployment();
  logger.info(`CircuitBreaker: ${await breaker.getAddress()}`);

  const OmniAgentVault = await ethers.getContractFactory("OmniAgentVault");
  const vault = await (await OmniAgentVault.deploy(usdtAddr, "OmniAgent WDK Vault", "OWDK", deployer.address, 500)).waitForDeployment();
  const vaultAddr = await vault.getAddress();
  logger.info(`OmniAgentVault: ${vaultAddr}`);

  const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
  const engine = await (await StrategyEngine.deploy(
    vaultAddr, await policy.getAddress(), usdtOracleAddr, await breaker.getAddress(), await sharpeTracker.getAddress(), ethers.parseUnits("1", 8)
  )).waitForDeployment();
  const engineAddr = await engine.getAddress();
  logger.info(`StrategyEngine: ${engineAddr}`);

  // 4. Deploy Adapters
  logger.info("\n--- Phase 4: Adapters ---");
  const XAUTYieldAdapter = await ethers.getContractFactory("XAUTYieldAdapter");
  const xautAdapter = await (await XAUTYieldAdapter.deploy(usdtAddr, xautAddr, xautOracleAddr, usdtOracleAddr, deployer.address)).waitForDeployment();
  const xautAdapterAddr = await xautAdapter.getAddress();
  logger.info(`XAUT Adapter: ${xautAdapterAddr}`);

  const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
  const secondaryAdapter = await (await ManagedAdapter.deploy(usdtAddr, deployer.address)).waitForDeployment();
  const lpAdapter = await (await ManagedAdapter.deploy(usdtAddr, deployer.address)).waitForDeployment();
  
  const MockAavePool = await ethers.getContractFactory("MockAavePool");
  const aavePool = await (await MockAavePool.deploy(usdtAddr, usdtAddr)).waitForDeployment();
  const AaveLendingAdapter = await ethers.getContractFactory("AaveLendingAdapter");
  const lendingAdapter = await (await AaveLendingAdapter.deploy(usdtAddr, usdtAddr, await aavePool.getAddress(), deployer.address)).waitForDeployment();
  const lendingAdapterAddr = await lendingAdapter.getAddress();

  logger.info(`Secondary Adapter: ${await secondaryAdapter.getAddress()}`);
  logger.info(`LP Adapter: ${await lpAdapter.getAddress()}`);
  logger.info(`Lending Adapter: ${lendingAdapterAddr}`);

  // 5. Wiring & Locking
  logger.info("\n--- Phase 5: Wiring ---");
  await (await sharpeTracker.setEngine(engineAddr)).wait();
  await (await vault.setEngine(engineAddr)).wait();
  await (await vault.setAdapters(
    xautAdapterAddr, 
    await secondaryAdapter.getAddress(), 
    await lpAdapter.getAddress(),
    lendingAdapterAddr
  )).wait();
  await (await xautAdapter.setVault(vaultAddr)).wait();
  await (await secondaryAdapter.setVault(vaultAddr)).wait();
  await (await lpAdapter.setVault(vaultAddr)).wait();
  await (await lendingAdapter.setVault(vaultAddr)).wait();
  logger.info("Wiring complete.");

  logger.info("Locking configurations...");
  await (await xautAdapter.lockConfiguration()).wait();
  await (await secondaryAdapter.lockConfiguration()).wait();
  await (await lpAdapter.lockConfiguration()).wait();
  await (await lendingAdapter.lockConfiguration()).wait();
  await (await vault.lockConfiguration()).wait();
  logger.info("Configurations locked.");

  const currentEngine = await vault.engine();
  logger.info(`Vault Engine set to: ${currentEngine}`);
  if (currentEngine === ethers.ZeroAddress) {
    throw new Error("Failed to set Vault Engine!");
  }

  // 6. Seed Data (Big Data Simulation)
  logger.info("\n--- Phase 6: Seeding Data ---");
  const userCount = 10;
  const seedAmount = ethers.parseUnits("10000", 6);
  logger.info(`Minting ${ethers.formatUnits(seedAmount * BigInt(userCount), 6)} USDT to ${userCount} test users and depositing...`);
  
  for (let i = 0; i < userCount; i++) {
    const tempWallet = ethers.Wallet.createRandom().connect(ethers.provider);
    const gasTx = await deployer.sendTransaction({ to: tempWallet.address, value: ethers.parseEther("0.1") });
    await gasTx.wait();

    await (await usdt.mint(tempWallet.address, seedAmount)).wait();
    await (await usdt.connect(tempWallet).approve(vaultAddr, seedAmount)).wait();
    
    logger.info(`  - Depositing for User ${i+1}: ${tempWallet.address}`);
    const depTx = await vault.connect(tempWallet).deposit(seedAmount, tempWallet.address);
    await depTx.wait();
    logger.info(`  - Seeded User ${i+1} success.`);
  }

  // Seed XAUT Adapter for value reporting
  await (await xaut.mint(xautAdapterAddr, ethers.parseUnits("10", 4))).wait();
  logger.info("Seeded XAUT Adapter with 10.0 oz Gold");

  // 7. Output Environment Variables
  logger.info("\n========================================");
  logger.info("   DEPLOYMENT COMPLETE");
  logger.info("========================================");
  const envContent = `
WDK_VAULT_ADDRESS=${vaultAddr}
WDK_ENGINE_ADDRESS=${engineAddr}
WDK_USDT_ADDRESS=${usdtAddr}
WDK_XAUT_ADDRESS=${xautAddr}
WDK_ZK_ORACLE_ADDRESS=${usdtOracleAddr}
WDK_BREAKER_ADDRESS=${await breaker.getAddress()}
`;
  logger.info(envContent);
  fs.writeFileSync(path.join(process.cwd(), '.env'), envContent);
  logger.info("Environment variables saved to .env");
}

main().catch((err) => logger.error(err));
