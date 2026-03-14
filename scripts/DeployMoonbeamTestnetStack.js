/**
 * DeployMoonbeamTestnetStack.js
 *
 * All-in-one Moonbeam Testnet (Moonbase Alpha) deploy: spins up mock external dependencies first,
 * then deploys the full ProofVault V2 + Farm stack wired to those mocks.
 * Targeted for Polkadot Hub Adaptation (Phase 5).
 *
 * Based on research from plans/260311-polkadot-hub-adaptation/phase-02-protocol-research.md:
 * - Moonbeam Chainlink USDC/USD feed: 0xA122591D650d7EE8eabC08d8d4Ea0560E1bC3B3f
 * - BeamSwap Stable AMM pool: 0xE3f59aB3c37c33b6368CDF4f8AC79644011E402C
 * - BeamSwap Router V2: 0x96b244391D98B62D19aE89b1A4dCcf0fc56970C7
 * - GLINT token: 0xcd3B51D98478D53F4515A306bE565c6EebeF1D58
 * - Moonwell mUSDC: 0x02e9081DfadD37A852F9a73C4d7d69e615E61334
 *
 * Usage:
 *   npx hardhat run scripts/DeployMoonbeamTestnetStack.js --network moonbeamTestnet
 */

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=== ProofVault V2 — Moonbeam Testnet (Moonbase Alpha) Full Deploy ===");
  console.log("Network:", hre.network.name);
  console.log("Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);
  console.log("Deployer:", deployer.address);

  // ── [PHASE 1] Deploy mock external dependencies ─────────────────────────────
  console.log("\n--- Phase 1: Mock external contracts (testnet only) ---");

  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  
  // Mock USDC (native xcUSDC not available on testnet)
  const usdc = await (
    await MockERC20.deploy("USD Coin", "USDC")
  ).waitForDeployment();
  console.log("USDC (Mock):  ", await usdc.getAddress());
  
  // Mock USDF (Aster USD equivalent)
  const usdf = await (
    await MockERC20.deploy("Aster USD", "USDF")
  ).waitForDeployment();
  console.log("USDF (Mock):  ", await usdf.getAddress());
  
  // Mock GLINT (BeamSwap governance token)
  const glint = await (
    await MockERC20.deploy("Glint Protocol", "GLINT")
  ).waitForDeployment();
  console.log("GLINT (Mock): ", await glint.getAddress());
  
  // Mock WGLMR (Wrapped Moonbeam native token)
  const wglmr = await (
    await MockERC20.deploy("Wrapped Moonbeam", "WGLMR")
  ).waitForDeployment();
  console.log("WGLMR (Mock): ", await wglmr.getAddress());

  // Mock BeamSwap MasterChef (farm)
  const MockMasterChef = await hre.ethers.getContractFactory("MockMasterChef");
  const masterChef = await (
    await MockMasterChef.deploy(await glint.getAddress())
  ).waitForDeployment();
  console.log("MasterChef (Mock):", await masterChef.getAddress());

  // Mock BeamSwap Router (UniswapV2-compatible)
  const MockPancakeRouter = await hre.ethers.getContractFactory(
    "MockPancakeRouter"
  );
  const router = await (await MockPancakeRouter.deploy()).waitForDeployment();
  console.log("BeamSwapRouter (Mock):", await router.getAddress());

  // Mock BeamSwap Stable AMM pool (Curve-style)
  const MockStableSwap = await hre.ethers.getContractFactory(
    "MockStableSwapPoolWithLPSupport"
  );
  const pool = await (
    await MockStableSwap.deploy(
      await usdf.getAddress(),
      await usdc.getAddress(),
      hre.ethers.parseEther("1000000"), // 1M USDF virtual balance
      hre.ethers.parseEther("1000000"), // 1M USDC virtual balance
      hre.ethers.parseEther("1"),       // virtual price 1.0
      0
    )
  ).waitForDeployment();
  console.log("StableSwapPool (Mock):", await pool.getAddress());

  // Register pool in MasterChef (pool ID = 0)
  await (await masterChef.addPool(await pool.getAddress())).wait();

  // Mock Moonwell ERC-4626 Vault
  const MockMinter = await hre.ethers.getContractFactory("MockMinter");
  const moonwellVault = await (await MockMinter.deploy()).waitForDeployment();
  console.log("MoonwellVault (Mock):", await moonwellVault.getAddress());

  // Mock Chainlink USDC/USD feed (Moonbeam has real one at 0xA122...3B3f)
  const MockChainlink = await hre.ethers.getContractFactory(
    "MockChainlinkAggregator"
  );
  const chainlinkFeed = await (
    await MockChainlink.deploy(8, hre.ethers.parseUnits("1", 8)) // $1.00 USDC
  ).waitForDeployment();
  console.log("ChainlinkFeed (Mock):", await chainlinkFeed.getAddress());

  // Mock USDF Minting (Aster protocol equivalent)
  const MockUSDFMinting = await hre.ethers.getContractFactory(
    "MockUSDFMinting"
  );
  const usdfMinting = await (
    await MockUSDFMinting.deploy(
      await usdf.getAddress(),
      await usdc.getAddress()
    )
  ).waitForDeployment();
  console.log("USDFMinting (Mock):", await usdfMinting.getAddress());

  // ── [PHASE 2] Deploy ProofVault V2 stack ────────────────────────────────────
  console.log("\n--- Phase 2: ProofVault V2 stack ---");

  const LP_POOL_ID = 0;
  const idleBufferBps = 500;  // 5% idle buffer
  const sharpeWindowSize = 20; // 20-epoch rolling window
  const initialPrice = hre.ethers.parseUnits("1", 8); // $1.00

  // [1] RiskPolicy
  const RiskPolicy = await hre.ethers.getContractFactory("RiskPolicy");
  const policy = await (
    await RiskPolicy.deploy(
      300, 150, 500, hre.ethers.parseUnits("0.97", 8), 100, 100, 2000, 5000, 7000, 5, 3600, idleBufferBps, sharpeWindowSize, 5000, 2000, 1500, 500
    )
  ).waitForDeployment();
  console.log("[1] RiskPolicy:", await policy.getAddress());

  // [2] Oracle
  const MockPriceOracle = await hre.ethers.getContractFactory(
    "MockPriceOracle"
  );
  const oracle = await (
    await MockPriceOracle.deploy(initialPrice, deployer.address)
  ).waitForDeployment();
  await (await oracle.lock()).wait();
  console.log("[2] Oracle:", await oracle.getAddress());

  // [3] CircuitBreaker
  const CircuitBreaker = await hre.ethers.getContractFactory("CircuitBreaker");
  const breaker = await (
    await CircuitBreaker.deploy(
      await chainlinkFeed.getAddress(),
      await pool.getAddress(),
      50, 100, 50, 3600, 259200 // 3-day staleness for testnet
    )
  ).waitForDeployment();
  console.log("[3] CircuitBreaker:", await breaker.getAddress());

  // [4] SharpeTracker
  const SharpeTracker = await hre.ethers.getContractFactory("SharpeTracker");
  const sharpeTracker = await (
    await SharpeTracker.deploy(sharpeWindowSize)
  ).waitForDeployment();
  console.log("[4] SharpeTracker:", await sharpeTracker.getAddress());

  // [5] AsterEarnAdapterWithSwap (now targeting Moonwell ERC-4626)
  const AsterEarnAdapterWithSwap = await hre.ethers.getContractFactory(
    "AsterEarnAdapterWithSwap"
  );
  const asterAdapter = await (
    await AsterEarnAdapterWithSwap.deploy(
      await usdc.getAddress(),
      await usdf.getAddress(),
      await moonwellVault.getAddress(),
      "0xb6b55f25", "0xad1728cb", "0x9ee679e8", "0x712679e8", "0x88d5b31a",
      await pool.getAddress(),
      deployer.address
    )
  ).waitForDeployment();
  console.log("[5] AsterEarnAdapter:", await asterAdapter.getAddress());

  // Seed pool with USDF for USDC→USDF swap path
  const SWAP_SEED = hre.ethers.parseEther("10000000"); // 10M USDF
  await (await usdf.mint(await pool.getAddress(), SWAP_SEED)).wait();
  console.log("  Pool seeded with 10M USDF for USDC→USDF swap ✓");

  // [6] ManagedAdapter (secondary)
  const ManagedAdapter = await hre.ethers.getContractFactory("ManagedAdapter");
  const secondaryAdapter = await (
    await ManagedAdapter.deploy(await usdc.getAddress(), deployer.address)
  ).waitForDeployment();
  console.log("[6] ManagedAdapter:", await secondaryAdapter.getAddress());

  // [7] StableSwapLPYieldAdapter (BeamSwap equivalent)
  const StableSwapLPYieldAdapterWithFarm = await hre.ethers.getContractFactory(
    "StableSwapLPYieldAdapterWithFarm"
  );
  const lpAdapter = await (
    await StableSwapLPYieldAdapterWithFarm.deploy(
      await usdc.getAddress(),
      await pool.getAddress(),
      await glint.getAddress(),
      await wglmr.getAddress(),
      await pool.getAddress(),
      await masterChef.getAddress(),
      await router.getAddress(),
      LP_POOL_ID,
      deployer.address
    )
  ).waitForDeployment();
  console.log("[7] LpAdapter:", await lpAdapter.getAddress());

  // [8] ProofVault
  const ProofVault = await hre.ethers.getContractFactory("ProofVault");
  const vault = await (
    await ProofVault.deploy(
      await usdc.getAddress(),
      "AsterPilot ProofVault (Moonbeam Testnet)",
      "apvMOON",
      deployer.address,
      idleBufferBps
    )
  ).waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("[8] ProofVault:", vaultAddr);

  // [9] StrategyEngine
  const StrategyEngine = await hre.ethers.getContractFactory("StrategyEngine");
  const engine = await (
    await StrategyEngine.deploy(
      vaultAddr,
      await policy.getAddress(),
      await oracle.getAddress(),
      await breaker.getAddress(),
      await sharpeTracker.getAddress(),
      initialPrice
    )
  ).waitForDeployment();
  const engineAddr = await engine.getAddress();
  await (await sharpeTracker.setEngine(engineAddr)).wait();
  console.log("[9] StrategyEngine:", engineAddr);

  // [10] PegArbExecutor
  const PegArbExecutor = await hre.ethers.getContractFactory("PegArbExecutor");
  const pegArb = await (
    await PegArbExecutor.deploy(
      vaultAddr,
      await usdc.getAddress(),
      await usdf.getAddress(),
      await usdfMinting.getAddress(),
      await pool.getAddress(),
      10, 500, 50, 50
    )
  ).waitForDeployment();
  console.log("[10] PegArbExecutor:", await pegArb.getAddress());

  // [11] ExecutionAuction
  const ExecutionAuction = await hre.ethers.getContractFactory(
    "ExecutionAuction"
  );
  const executionAuction = await (
    await ExecutionAuction.deploy(
      engineAddr,
      vaultAddr,
      await usdc.getAddress(),
      120, 60, hre.ethers.parseUnits("1", 6), 500
    )
  ).waitForDeployment();
  console.log("[11] ExecutionAuction:", await executionAuction.getAddress());

  // ── [PHASE 3] Wire ──────────────────────────────────────────────────────────
  console.log("\n--- Phase 3: Wiring ---");
  await (await vault.setEngine(engineAddr)).wait();
  await (
    await vault.setAdapters(
      await asterAdapter.getAddress(),
      await secondaryAdapter.getAddress(),
      await lpAdapter.getAddress()
    )
  ).wait();
  await (await vault.setPegArbExecutor(await pegArb.getAddress())).wait();
  await (await asterAdapter.setVault(vaultAddr)).wait();
  await (await secondaryAdapter.setVault(vaultAddr)).wait();
  await (await lpAdapter.setVault(vaultAddr)).wait();
  console.log("All adapters wired.");

  // ── [PHASE 4] Lock ──────────────────────────────────────────────────────────
  console.log("\n--- Phase 4: Locking ---");
  await (await asterAdapter.lockConfiguration()).wait();
  await (await secondaryAdapter.lockConfiguration()).wait();
  await (await lpAdapter.lockConfiguration()).wait();
  await (await vault.lockConfiguration()).wait();
  console.log("All configurations locked.");

  const usdcAddr = await usdc.getAddress();
  const usdfAddr = await usdf.getAddress();
  const glintAddr = await glint.getAddress();
  const poolAddr = await pool.getAddress();
  const routerAddr = await router.getAddress();
  const breakerAddr = await breaker.getAddress();
  const sharpeAddr = await sharpeTracker.getAddress();
  const pegArbAddr = await pegArb.getAddress();
  const auctionAddr = await executionAuction.getAddress();
  const policyAddr = await policy.getAddress();
  const oracleAddr = await oracle.getAddress();
  const asterAdapterAddr = await asterAdapter.getAddress();
  const secondaryAdapterAddr = await secondaryAdapter.getAddress();
  const lpAdapterAddr = await lpAdapter.getAddress();

  console.log("\n========================================");
  console.log("   MOONBEAM TESTNET DEPLOY COMPLETE");
  console.log("========================================");
  console.log("Network:        Moonbase Alpha (Chain ID 1287)");
  console.log("Vault:          ", vaultAddr);
  console.log("Engine:         ", engineAddr);
  console.log("Token (USDC):   ", usdcAddr);
  console.log("USDF:           ", usdfAddr);
  console.log("GLINT:          ", glintAddr);
  console.log("Pool:           ", poolAddr);
  console.log("Router:         ", routerAddr);
  console.log("\n--- Copy to frontend/lib/contractAddresses.js ---");
  console.log(`export const MOONBEAM_TESTNET_PRESET = {`);
  console.log(`  VAULT: "${vaultAddr}",`);
  console.log(`  STRATEGY_ENGINE: "${engineAddr}",`);
  console.log(`  CIRCUIT_BREAKER: "${breakerAddr}",`);
  console.log(`  SHARPE_TRACKER: "${sharpeAddr}",`);
  console.log(`  PEG_ARB_EXECUTOR: "${pegArbAddr}",`);
  console.log(`  EXECUTION_AUCTION: "${auctionAddr}",`);
  console.log(`  RISK_POLICY: "${policyAddr}",`);
  console.log(`  ORACLE: "${oracleAddr}",`);
  console.log(`  ASTER_ADAPTER: "${asterAdapterAddr}",`);
  console.log(`  SECONDARY_ADAPTER: "${secondaryAdapterAddr}",`);
  console.log(`  LP_ADAPTER: "${lpAdapterAddr}",`);
  console.log(`  USDC: "${usdcAddr}",`);
  console.log(`  USDF: "${usdfAddr}",`);
  console.log(`  GLINT: "${glintAddr}",`);
  console.log(`  POOL: "${poolAddr}",`);
  console.log(`  ROUTER: "${routerAddr}",`);
  console.log(`};`);
  console.log("\n--- VITE Environment Variables ---");
  console.log(`VITE_MOONBEAM_VAULT_ADDRESS=${vaultAddr}`);
  console.log(`VITE_MOONBEAM_ENGINE_ADDRESS=${engineAddr}`);
  console.log(`VITE_MOONBEAM_TOKEN_ADDRESS=${usdcAddr}`);
  console.log(`VITE_MOONBEAM_CIRCUIT_BREAKER_ADDRESS=${breakerAddr}`);
  console.log(`VITE_MOONBEAM_SHARPE_TRACKER_ADDRESS=${sharpeAddr}`);
  console.log(`VITE_MOONBEAM_PEG_ARB_EXECUTOR_ADDRESS=${pegArbAddr}`);
  console.log(`VITE_MOONBEAM_EXECUTION_AUCTION_ADDRESS=${auctionAddr}`);
  console.log(`VITE_MOONBEAM_POLICY_ADDRESS=${policyAddr}`);
  console.log(`VITE_MOONBEAM_ASTER_ADAPTER_ADDRESS=${asterAdapterAddr}`);
  console.log(`VITE_MOONBEAM_SECONDARY_ADAPTER_ADDRESS=${secondaryAdapterAddr}`);
  console.log("========================================");
  console.log("\n⚠️  NEXT STEPS:");
  console.log("1. Run: npx hardhat run scripts/SeedMoonbeamTestnetReserves.js --network moonbeamTestnet");
  console.log("2. Run: npx hardhat run scripts/SeedMoonbeamTestnetVaultDeposit.js --network moonbeamTestnet");
  console.log("3. Update frontend/lib/contractAddresses.js with MOONBEAM_TESTNET_PRESET");
  console.log("4. Run integration tests");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
