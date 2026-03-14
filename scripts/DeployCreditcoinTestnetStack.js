/**
 * DeployCreditcoinTestnetStack.js
 *
 * All-in-one Creditcoin Testnet (Hella) deploy: spins up mock external dependencies first,
 * then deploys the full ProofVault V2 + Farm stack wired to those mocks.
 * Targeted for BUIDL CTC Hackathon 2026.
 *
 * Usage:
 *   npx hardhat run scripts/DeployCreditcoinTestnetStack.js --network creditcoinTestnet
 */

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=== ProofVault V2 — Creditcoin Testnet (Hella) Full Deploy ===");
  console.log("Network:", hre.network.name);
  console.log("Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);
  console.log("Deployer:", deployer.address);

  // ── [PHASE 1] Deploy mock external dependencies ─────────────────────────────
  console.log("\n--- Phase 1: Mock external contracts ---");

  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const usdt = await (
    await MockERC20.deploy("Tether USD", "USDT")
  ).waitForDeployment();
  const usdf = await (
    await MockERC20.deploy("Aster USD", "USDF")
  ).waitForDeployment();
  const cake = await (
    await MockERC20.deploy("PancakeSwap Token", "CAKE")
  ).waitForDeployment();
  const wbnb = await (
    await MockERC20.deploy("Wrapped BNB", "WBNB")
  ).waitForDeployment();
  console.log("USDT (Mock):  ", await usdt.getAddress());
  console.log("USDF (Mock):  ", await usdf.getAddress());
  console.log("CAKE (Mock):  ", await cake.getAddress());
  console.log("WBNB (Mock):  ", await wbnb.getAddress());

  const MockMasterChef = await hre.ethers.getContractFactory("MockMasterChef");
  const masterChef = await (
    await MockMasterChef.deploy(await cake.getAddress())
  ).waitForDeployment();
  console.log("MasterChef (Mock):", await masterChef.getAddress());

  const MockPancakeRouter = await hre.ethers.getContractFactory(
    "MockPancakeRouter"
  );
  const router = await (await MockPancakeRouter.deploy()).waitForDeployment();
  console.log("Router (Mock):", await router.getAddress());

  const MockStableSwap = await hre.ethers.getContractFactory(
    "MockStableSwapPoolWithLPSupport"
  );
  const pool = await (
    await MockStableSwap.deploy(
      await usdf.getAddress(),
      await usdt.getAddress(),
      hre.ethers.parseEther("1000000"),
      hre.ethers.parseEther("1000000"),
      hre.ethers.parseEther("1"),
      0
    )
  ).waitForDeployment();
  console.log("StableSwapPool (Mock):", await pool.getAddress());

  // Register pool in MasterChef (pool ID = 0)
  await (await masterChef.addPool(await pool.getAddress())).wait();

  const MockMinter = await hre.ethers.getContractFactory("MockMinter");
  const asterMinter = await (await MockMinter.deploy()).waitForDeployment(); 
  console.log("AsterMinter (Mock):", await asterMinter.getAddress());

  const MockChainlink = await hre.ethers.getContractFactory(
    "MockChainlinkAggregator"
  );
  const chainlinkFeed = await (
    await MockChainlink.deploy(8, hre.ethers.parseUnits("1", 8))
  ).waitForDeployment();
  console.log("ChainlinkFeed (Mock):", await chainlinkFeed.getAddress());

  const MockUSDFMinting = await hre.ethers.getContractFactory(
    "MockUSDFMinting"
  );
  const usdfMinting = await (
    await MockUSDFMinting.deploy(
      await usdf.getAddress(),
      await usdt.getAddress()
    )
  ).waitForDeployment();
  console.log("USDFMinting (Mock):", await usdfMinting.getAddress());

  // ── [PHASE 2] Deploy ProofVault V2 stack ────────────────────────────────────
  console.log("\n--- Phase 2: ProofVault V2 stack ---");

  const LP_POOL_ID = 0;
  const idleBufferBps = 500;
  const sharpeWindowSize = 20;
  const initialPrice = hre.ethers.parseUnits("1", 8);

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
      50, 100, 50, 3600, 259200
    )
  ).waitForDeployment();
  console.log("[3] CircuitBreaker:", await breaker.getAddress());

  // [4] SharpeTracker
  const SharpeTracker = await hre.ethers.getContractFactory("SharpeTracker");
  const sharpeTracker = await (
    await SharpeTracker.deploy(sharpeWindowSize)
  ).waitForDeployment();
  console.log("[4] SharpeTracker:", await sharpeTracker.getAddress());

  // [5] AsterEarnAdapterWithSwap
  const AsterEarnAdapterWithSwap = await hre.ethers.getContractFactory(
    "AsterEarnAdapterWithSwap"
  );
  const asterAdapter = await (
    await AsterEarnAdapterWithSwap.deploy(
      await usdt.getAddress(),
      await usdf.getAddress(),
      await asterMinter.getAddress(),
      "0xb6b55f25", "0xad1728cb", "0x9ee679e8", "0x712679e8", "0x88d5b31a",
      await pool.getAddress(),
      deployer.address
    )
  ).waitForDeployment();
  console.log("[5] AsterEarnAdapter:", await asterAdapter.getAddress());

  const SWAP_SEED = hre.ethers.parseEther("10000000"); 
  await (await usdf.mint(await pool.getAddress(), SWAP_SEED)).wait();

  // [6] ManagedAdapter
  const ManagedAdapter = await hre.ethers.getContractFactory("ManagedAdapter");
  const secondaryAdapter = await (
    await ManagedAdapter.deploy(await usdt.getAddress(), deployer.address)
  ).waitForDeployment();
  console.log("[6] ManagedAdapter:", await secondaryAdapter.getAddress());

  // [7] StableSwapLPYieldAdapter
  const StableSwapLPYieldAdapterWithFarm = await hre.ethers.getContractFactory(
    "StableSwapLPYieldAdapterWithFarm"
  );
  const lpAdapter = await (
    await StableSwapLPYieldAdapterWithFarm.deploy(
      await usdt.getAddress(),
      await pool.getAddress(),
      await cake.getAddress(),
      await wbnb.getAddress(),
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
      await usdt.getAddress(),
      "AsterPilot ProofVault (CTC Testnet)",
      "apvCTC",
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
      await usdt.getAddress(),
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
      await usdt.getAddress(),
      120, 60, hre.ethers.parseUnits("1", 18), 500
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

  const usdtAddr = await usdt.getAddress();

  console.log("\n========================================");
  console.log("   CREDITCOIN TESTNET DEPLOY COMPLETE");
  console.log("========================================");
  console.log("Vault:          ", vaultAddr);
  console.log("Engine:         ", engineAddr);
  console.log("Token (USDT):   ", usdtAddr);
  console.log("\n--- Copy to frontend .env / config ---");
  console.log(`VITE_CREDITCOIN_VAULT_ADDRESS=${vaultAddr}`);
  console.log(`VITE_CREDITCOIN_ENGINE_ADDRESS=${engineAddr}`);
  console.log(`VITE_CREDITCOIN_TOKEN_ADDRESS=${usdtAddr}`);
  console.log(`VITE_CREDITCOIN_CIRCUIT_BREAKER_ADDRESS=${await breaker.getAddress()}`);
  console.log(`VITE_CREDITCOIN_SHARPE_TRACKER_ADDRESS=${await sharpeTracker.getAddress()}`);
  console.log(`VITE_CREDITCOIN_PEG_ARB_EXECUTOR_ADDRESS=${await pegArb.getAddress()}`);
  console.log(`VITE_CREDITCOIN_EXECUTION_AUCTION_ADDRESS=${await executionAuction.getAddress()}`);
  console.log(`VITE_CREDITCOIN_POLICY_ADDRESS=${await policy.getAddress()}`);
  console.log(`VITE_CREDITCOIN_ASTER_ADAPTER_ADDRESS=${await asterAdapter.getAddress()}`);
  console.log(`VITE_CREDITCOIN_SECONDARY_ADAPTER_ADDRESS=${await secondaryAdapter.getAddress()}`);
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
