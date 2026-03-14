/**
 * deploy-mainnet-full-stack.js
 *
 * Deploys the full ProofVault V2 stack to BSC Mainnet (chain 56).
 *
 * Architecture:
 *   Rail 1 (Aster):     AsterEarnAdapter  → AsterDEX Earn minter (async yield)
 *   Rail 2 (Secondary): ManagedAdapter    → idle capture + Venus fallback buffer
 *   Rail 3 (LP):        StableSwapLPYieldAdapterWithFarm  [optional — set V2_LP_POOL_ID to enable]
 *
 * IMPORTANT: Read before running
 *   1. Set PRIVATE_KEY in .env (deployer, separate from admin).
 *   2. Confirm V2_USDF_MINTING_ADDRESS with AsterDEX team.
 *   3. Confirm V2_LP_POOL_ID with AsterDEX team (MasterChef pool for USDF/USDT LP).
 *   4. Run on fork first: ENABLE_MAINNET_FORK=true npx hardhat run this script --network hardhat
 *   5. Then deploy to mainnet: npx hardhat run scripts/deploy-mainnet-full-stack.js --network bnb
 *
 * Well-known BSC Mainnet addresses are hardcoded (can be overridden via env).
 * Unknown AsterDEX-specific addresses are required via env (script aborts if missing).
 *
 * After successful deploy:
 *   - Update frontend/lib/contractAddresses.js V2_MAINNET_PRESET with new addresses
 *   - Verify contracts on BscScan: npx hardhat verify --network bnb <address> <constructor args...>
 */

const hre = require("hardhat");

// ── Well-known BSC Mainnet addresses (canonical, override via env if needed) ──────────────────
const BSC_USDT =
  process.env.V2_ASSET_ADDRESS || "0x55d398326f99059fF775485246999027B3197955";
const BSC_USDF =
  process.env.V2_USDF_ADDRESS || "0xc271fc70dd9e678a6a43a982f436e12d4a63c0a5";
const BSC_CHAINLINK_FEED =
  process.env.V2_CHAINLINK_FEED || "0xB97Ad0E74fa7d920791E90258A6E2085088b4320"; // USDT/USD
const BSC_STABLESWAP =
  process.env.V2_STABLESWAP_POOL ||
  "0x176f274335c8B5fD5Ec5e8274d0cf36b08E44A57"; // USDF/USDT pool
const BSC_PANCAKE_ROUTER =
  process.env.V2_PANCAKE_ROUTER || "0x10ED43C718714eb63d5aA57B78B54704E256024E"; // PCS V2
const BSC_CAKE =
  process.env.V2_CAKE_TOKEN || "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";
const BSC_MASTERCHEF =
  process.env.V2_MASTERCHEF || "0x556B9306565093C855AEA9AE92A594704c2Cd59e"; // MasterChef V3
const BSC_WBNB =
  process.env.V2_WBNB_ADDRESS || "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

// ── Unknown addresses — REQUIRED from AsterDEX team ──────────────────────────────────────────
const ASTER_MINTER = process.env.V2_MINTER_ADDRESS; // AsterDEX Earn minter
const USDF_MINTING = process.env.V2_USDF_MINTING_ADDRESS; // USDF Minting contract (for PegArb)

// ── AsterEarnAdapter selectors (can be overridden if AsterDEX minter ABI changes) ────────────
const SEL_DEPOSIT = process.env.V2_DEPOSIT_SELECTOR || "0xb6b55f25";
const SEL_MANAGED_ASSETS =
  process.env.V2_MANAGED_ASSETS_SELECTOR || "0xad1728cb";
const SEL_REQUEST_WD = process.env.V2_REQUEST_WITHDRAW_SELECTOR || "0x9ee679e8";
const SEL_CLAIM_WD = process.env.V2_CLAIM_WITHDRAW_SELECTOR || "0x712679e8";
const SEL_GET_WD_REQ =
  process.env.V2_GET_WITHDRAW_REQUEST_SELECTOR || "0x88d5b31a";

// ── LP rail — optional, only deployed if V2_LP_POOL_ID is set to a non-zero value ──────────────
// "0" or empty string both disable LP rail (pool ID 0 is not the USDF/USDT pool)
const LP_POOL_ID =
  process.env.V2_LP_POOL_ID && process.env.V2_LP_POOL_ID !== "0"
    ? process.env.V2_LP_POOL_ID
    : undefined;
const LP_TOKEN = process.env.V2_LP_TOKEN_ADDRESS || BSC_STABLESWAP; // LP token = pool on PCS

// ── Policy params (production-safe conservative defaults) ────────────────────────────────────
const COOLDOWN = Number(process.env.V2_POLICY_COOLDOWN || "300"); // 5 min
const GUARDED_VOL_BPS = Number(process.env.V2_POLICY_GUARDED_VOL_BPS || "150"); // 1.5%
const DRAWDOWN_VOL_BPS = Number(
  process.env.V2_POLICY_DRAWDOWN_VOL_BPS || "500"
); // 5%
const MAX_SLIPPAGE_BPS = Number(
  process.env.V2_POLICY_MAX_SLIPPAGE_BPS || "100"
); // 1%
const MAX_BOUNTY_BPS = Number(process.env.V2_POLICY_MAX_BOUNTY_BPS || "100"); // 1%
const MIN_BOUNTY_BPS = Number(process.env.V2_POLICY_MIN_BOUNTY_BPS || "5"); // 0.05%
const NORMAL_ASTER_BPS = Number(
  process.env.V2_POLICY_NORMAL_ASTER_BPS || "6000"
); // 60%
const GUARDED_ASTER_BPS = Number(
  process.env.V2_POLICY_GUARDED_ASTER_BPS || "7000"
); // 70%
const DRAWDOWN_ASTER_BPS = Number(
  process.env.V2_POLICY_DRAWDOWN_ASTER_BPS || "8000"
); // 80%
const NORMAL_LP_BPS = LP_POOL_ID
  ? Number(process.env.V2_POLICY_NORMAL_LP_BPS || "2000")
  : 0;
const GUARDED_LP_BPS = LP_POOL_ID
  ? Number(process.env.V2_POLICY_GUARDED_LP_BPS || "1500")
  : 0;
const DRAWDOWN_LP_BPS = LP_POOL_ID
  ? Number(process.env.V2_POLICY_DRAWDOWN_LP_BPS || "500")
  : 0;
const IDLE_BUFFER_BPS = Number(process.env.V2_POLICY_IDLE_BUFFER_BPS || "500"); // 5%
const SHARPE_WINDOW = Number(process.env.V2_POLICY_SHARPE_WINDOW_SIZE || "20");
const SHARPE_THRESHOLD = Number(
  process.env.V2_POLICY_SHARPE_LOW_THRESHOLD || "5000"
);
const AUCTION_DURATION = Number(
  process.env.V2_POLICY_AUCTION_DURATION || "3600"
); // 1 hr

// ── CircuitBreaker ────────────────────────────────────────────────────────────────────────────
const CB_SIG_A_BPS = Number(process.env.V2_BREAKER_SIGNAL_A_BPS || "50"); // 0.5% USDT/USD deviation
const CB_SIG_B_BPS = Number(process.env.V2_BREAKER_SIGNAL_B_BPS || "100"); // 1% reserve ratio
const CB_SIG_C_BPS = Number(process.env.V2_BREAKER_SIGNAL_C_BPS || "50"); // 0.5% VP drop
const CB_RECOVERY = Number(process.env.V2_BREAKER_RECOVERY_COOLDOWN || "3600"); // 1 hr
const CB_STALE_PERIOD = Number(process.env.V2_BREAKER_STALE_PERIOD || "3600"); // 1 hr Chainlink staleness

// ── Oracle ────────────────────────────────────────────────────────────────────────────────────
const ORACLE_STALE_SEC = Number(process.env.V2_ORACLE_STALE_SECONDS || "7200"); // 2 hr staleness

// ── PegArbExecutor ────────────────────────────────────────────────────────────────────────────
const ARB_MIN_PROFIT = Number(process.env.V2_ARB_MIN_PROFIT_BPS || "10"); // 0.1%
const ARB_MAX_SIZE = Number(process.env.V2_ARB_MAX_SIZE_BPS || "500"); // 5% of vault idle
const ARB_BOUNTY = Number(process.env.V2_ARB_BOUNTY_BPS || "50"); // 0.5%
const ARB_DEV_THRESHOLD = Number(
  process.env.V2_ARB_DEVIATION_THRESHOLD_BPS || "50"
); // 0.5%

// ── ExecutionAuction ─────────────────────────────────────────────────────────────────────────
const AUCTION_BID_WINDOW = Number(process.env.V2_AUCTION_BID_WINDOW || "300"); // 5 min
const AUCTION_EXEC_WINDOW = Number(process.env.V2_AUCTION_EXEC_WINDOW || "300"); // 5 min
// minBid: 10 USDT (BSC USDT has 18 decimals)
const AUCTION_MIN_BID = process.env.V2_AUCTION_MIN_BID
  ? hre.ethers.parseUnits(process.env.V2_AUCTION_MIN_BID, 18)
  : hre.ethers.parseUnits("10", 18);
const AUCTION_MIN_INCREMENT_BPS = Number(
  process.env.V2_AUCTION_MIN_INCREMENT_BPS || "500"
); // 5%

function requireAddress(value, name) {
  if (
    !value ||
    value === "" ||
    value === "0x0000000000000000000000000000000000000000"
  ) {
    throw new Error(
      `\n❌ Missing required env var: ${name}\n` +
        `   Confirm this address with the AsterDEX team and add it to your .env file.\n`
    );
  }
  return value;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       ProofVault V2 — BSC Mainnet Full Deploy            ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("Network:  ", hre.network.name, `(chain ${chainId})`);
  console.log("Deployer: ", deployer.address);
  console.log(
    "LP Rail:  ",
    LP_POOL_ID
      ? `enabled (pool ${LP_POOL_ID})`
      : "disabled (V2_LP_POOL_ID not set)"
  );
  console.log();

  // Validate required addresses before spending gas
  requireAddress(ASTER_MINTER, "V2_MINTER_ADDRESS");
  requireAddress(USDF_MINTING, "V2_USDF_MINTING_ADDRESS");

  const initialPrice = hre.ethers.parseUnits("1", 8); // $1.00 — USDT is pegged

  // ── [1] RiskPolicy ──────────────────────────────────────────────────────────
  process.stdout.write("[1/11] Deploying RiskPolicy... ");
  const RiskPolicy = await hre.ethers.getContractFactory("RiskPolicy");
  const policy = await (
    await RiskPolicy.deploy(
      COOLDOWN,
      GUARDED_VOL_BPS,
      DRAWDOWN_VOL_BPS,
      hre.ethers.parseUnits("0.97", 8), // depegPrice = $0.97
      MAX_SLIPPAGE_BPS,
      MAX_BOUNTY_BPS,
      NORMAL_ASTER_BPS,
      GUARDED_ASTER_BPS,
      DRAWDOWN_ASTER_BPS,
      MIN_BOUNTY_BPS,
      AUCTION_DURATION,
      IDLE_BUFFER_BPS,
      SHARPE_WINDOW,
      SHARPE_THRESHOLD,
      NORMAL_LP_BPS,
      GUARDED_LP_BPS,
      DRAWDOWN_LP_BPS
    )
  ).waitForDeployment();
  console.log(await policy.getAddress());

  // ── [2] ChainlinkPriceOracle ────────────────────────────────────────────────
  process.stdout.write("[2/11] Deploying ChainlinkPriceOracle... ");
  const ChainlinkPriceOracle = await hre.ethers.getContractFactory(
    "ChainlinkPriceOracle"
  );
  const oracle = await (
    await ChainlinkPriceOracle.deploy(BSC_CHAINLINK_FEED, ORACLE_STALE_SEC)
  ).waitForDeployment();
  console.log(await oracle.getAddress());

  // ── [3] CircuitBreaker ──────────────────────────────────────────────────────
  // NOTE: Points to the real BSC StableSwap pool. Signal B will trip if the
  // USDF/USDT pool has a genuine reserve imbalance > 1%. This is correct production
  // behavior — use MockStableSwapPool ONLY in fork tests (scripts/fork-test-mainnet.js).
  process.stdout.write("[3/11] Deploying CircuitBreaker... ");
  const CircuitBreaker = await hre.ethers.getContractFactory("CircuitBreaker");
  const breaker = await (
    await CircuitBreaker.deploy(
      BSC_CHAINLINK_FEED,
      BSC_STABLESWAP,
      CB_SIG_A_BPS,
      CB_SIG_B_BPS,
      CB_SIG_C_BPS,
      CB_RECOVERY,
      CB_STALE_PERIOD
    )
  ).waitForDeployment();
  console.log(await breaker.getAddress());

  // ── [4] SharpeTracker ───────────────────────────────────────────────────────
  process.stdout.write("[4/11] Deploying SharpeTracker... ");
  const SharpeTracker = await hre.ethers.getContractFactory("SharpeTracker");
  const sharpeTracker = await (
    await SharpeTracker.deploy(SHARPE_WINDOW)
  ).waitForDeployment();
  console.log(await sharpeTracker.getAddress());

  // ── [5] AsterEarnAdapterWithSwap ─────────────────────────────────────────
  // Uses AsterEarnAdapterWithSwap — swaps USDT→USDF via StableSwap pool before
  // depositing into AsterDEX Earn. PancakeSwap V2 USDT/USDF pair does not exist
  // on BSC mainnet; all USDT/USDF liquidity lives in the StableSwap pool.
  process.stdout.write("[5/11] Deploying AsterEarnAdapter... ");
  const AsterEarnAdapter = await hre.ethers.getContractFactory(
    "AsterEarnAdapterWithSwap"
  );
  const asterAdapter = await (
    await AsterEarnAdapter.deploy(
      BSC_USDT,
      BSC_USDF,
      ASTER_MINTER,
      SEL_DEPOSIT,
      SEL_MANAGED_ASSETS,
      SEL_REQUEST_WD,
      SEL_CLAIM_WD,
      SEL_GET_WD_REQ,
      BSC_STABLESWAP, // swap pool for USDT↔USDF (coin1↔coin0)
      deployer.address
    )
  ).waitForDeployment();
  console.log(await asterAdapter.getAddress());

  // ── [6] ManagedAdapter (secondary buffer) ──────────────────────────────────
  process.stdout.write("[6/11] Deploying ManagedAdapter (secondary)... ");
  const ManagedAdapter = await hre.ethers.getContractFactory("ManagedAdapter");
  const secondaryAdapter = await (
    await ManagedAdapter.deploy(BSC_USDT, deployer.address)
  ).waitForDeployment();
  console.log(await secondaryAdapter.getAddress());

  // ── [7] StableSwapLPYieldAdapterWithFarm (optional) ────────────────────────
  let lpAdapter = null;
  if (LP_POOL_ID) {
    process.stdout.write(
      "[7/11] Deploying StableSwapLPYieldAdapterWithFarm... "
    );
    const StableSwapLPAdapter = await hre.ethers.getContractFactory(
      "StableSwapLPYieldAdapterWithFarm"
    );
    lpAdapter = await (
      await StableSwapLPAdapter.deploy(
        BSC_USDT,
        LP_TOKEN,
        BSC_CAKE,
        BSC_WBNB,
        BSC_STABLESWAP,
        BSC_MASTERCHEF,
        BSC_PANCAKE_ROUTER,
        Number(LP_POOL_ID),
        deployer.address
      )
    ).waitForDeployment();
    console.log(await lpAdapter.getAddress());
  } else {
    console.log(
      "[7/11] StableSwapLPYieldAdapterWithFarm — SKIPPED (V2_LP_POOL_ID not set)"
    );
  }

  // ── [8] ProofVault ──────────────────────────────────────────────────────────
  process.stdout.write("[8/11] Deploying ProofVault... ");
  const ProofVault = await hre.ethers.getContractFactory("ProofVault");
  const vault = await (
    await ProofVault.deploy(
      BSC_USDT,
      "AsterPilot ProofVault V2 Share",
      "apvV2SHARE",
      deployer.address,
      IDLE_BUFFER_BPS
    )
  ).waitForDeployment();
  console.log(await vault.getAddress());

  // ── [9] StrategyEngine ──────────────────────────────────────────────────────
  process.stdout.write("[9/11] Deploying StrategyEngine... ");
  const StrategyEngine = await hre.ethers.getContractFactory("StrategyEngine");
  const engine = await (
    await StrategyEngine.deploy(
      await vault.getAddress(),
      await policy.getAddress(),
      await oracle.getAddress(),
      await breaker.getAddress(),
      await sharpeTracker.getAddress(),
      initialPrice
    )
  ).waitForDeployment();

  // setEngine() is now deployer-only (H-01 fix). Call immediately after deploy.
  await (await sharpeTracker.setEngine(await engine.getAddress())).wait();
  console.log(await engine.getAddress());

  // ── [10] PegArbExecutor ─────────────────────────────────────────────────────
  process.stdout.write("[10/11] Deploying PegArbExecutor... ");
  const PegArbExecutor = await hre.ethers.getContractFactory("PegArbExecutor");
  const pegArb = await (
    await PegArbExecutor.deploy(
      await vault.getAddress(),
      BSC_USDT,
      BSC_USDF,
      USDF_MINTING,
      BSC_STABLESWAP,
      ARB_MIN_PROFIT,
      ARB_MAX_SIZE,
      ARB_BOUNTY,
      ARB_DEV_THRESHOLD
    )
  ).waitForDeployment();
  console.log(await pegArb.getAddress());

  // ── [11] ExecutionAuction ───────────────────────────────────────────────────
  process.stdout.write("[11/11] Deploying ExecutionAuction... ");
  const ExecutionAuction = await hre.ethers.getContractFactory(
    "ExecutionAuction"
  );
  const auction = await (
    await ExecutionAuction.deploy(
      await engine.getAddress(),
      await vault.getAddress(),
      BSC_USDT,
      AUCTION_BID_WINDOW,
      AUCTION_EXEC_WINDOW,
      AUCTION_MIN_BID,
      AUCTION_MIN_INCREMENT_BPS
    )
  ).waitForDeployment();
  console.log(await auction.getAddress());

  // ── Wiring ──────────────────────────────────────────────────────────────────
  console.log("\n── Wiring contracts ────────────────────────────────────────");
  await (await vault.setEngine(await engine.getAddress())).wait();
  console.log("  vault.setEngine() ✓");

  const lpAdapterAddr = lpAdapter
    ? await lpAdapter.getAddress()
    : hre.ethers.ZeroAddress;
  await (
    await vault.setAdapters(
      await asterAdapter.getAddress(),
      await secondaryAdapter.getAddress(),
      lpAdapterAddr
    )
  ).wait();
  console.log(
    "  vault.setAdapters() ✓" + (lpAdapter ? " [LP rail active]" : " [LP=0x0]")
  );

  await (await vault.setPegArbExecutor(await pegArb.getAddress())).wait();
  console.log(
    "  vault.setPegArbExecutor() ✓  (unlimited USDT approval for arb — irrevocable after lock)"
  );

  await (await asterAdapter.setVault(await vault.getAddress())).wait();
  console.log("  asterAdapter.setVault() ✓");

  await (await secondaryAdapter.setVault(await vault.getAddress())).wait();
  console.log("  secondaryAdapter.setVault() ✓");

  if (lpAdapter) {
    await (await lpAdapter.setVault(await vault.getAddress())).wait();
    console.log("  lpAdapter.setVault() ✓");
  }

  // ── Locking (IRREVERSIBLE — owner renounced on all adapters and vault) ──────
  console.log("\n── Locking configurations (IRREVERSIBLE) ───────────────────");
  await (await asterAdapter.lockConfiguration()).wait();
  console.log("  asterAdapter.lockConfiguration() ✓  [ownership renounced]");

  await (await secondaryAdapter.lockConfiguration()).wait();
  console.log(
    "  secondaryAdapter.lockConfiguration() ✓  [ownership renounced]"
  );

  if (lpAdapter) {
    await (await lpAdapter.lockConfiguration()).wait();
    console.log("  lpAdapter.lockConfiguration() ✓  [ownership renounced]");
  }

  await (await vault.lockConfiguration()).wait();
  console.log("  vault.lockConfiguration() ✓  [ownership renounced]");

  // ── Verification checks ─────────────────────────────────────────────────────
  const vaultOwner = await vault.owner();
  const asterOwner = await asterAdapter.owner();
  const secOwner = await secondaryAdapter.owner();
  const oracleLocked = await oracle.locked();

  if (vaultOwner !== hre.ethers.ZeroAddress)
    console.warn("⚠️  vault owner != 0x0:", vaultOwner);
  if (asterOwner !== hre.ethers.ZeroAddress)
    console.warn("⚠️  asterAdapter owner != 0x0:", asterOwner);
  if (secOwner !== hre.ethers.ZeroAddress)
    console.warn("⚠️  secondaryAdapter owner != 0x0:", secOwner);
  if (!oracleLocked)
    console.warn("⚠️  ChainlinkPriceOracle reports unlocked (unexpected)");

  // ── Final summary ────────────────────────────────────────────────────────────
  const vaultAddr = await vault.getAddress();
  const engineAddr = await engine.getAddress();
  const policyAddr = await policy.getAddress();
  const oracleAddr = await oracle.getAddress();
  const breakerAddr = await breaker.getAddress();
  const sharpeAddr = await sharpeTracker.getAddress();
  const asterAddr = await asterAdapter.getAddress();
  const secAddr = await secondaryAdapter.getAddress();
  const lpAddr = lpAdapter
    ? await lpAdapter.getAddress()
    : hre.ethers.ZeroAddress;
  const pegArbAddr = await pegArb.getAddress();
  const auctionAddr = await auction.getAddress();

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║          MAINNET DEPLOYMENT COMPLETE                     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("Network:           ", hre.network.name, `(chain ${chainId})`);
  console.log("Deployer:          ", deployer.address);
  console.log("USDT:              ", BSC_USDT);
  console.log("USDF:              ", BSC_USDF);
  console.log("AsterMinter:       ", ASTER_MINTER);
  console.log("StableSwap pool:   ", BSC_STABLESWAP);
  console.log("Chainlink feed:    ", BSC_CHAINLINK_FEED);
  console.log("\nDeployed contracts:");
  console.log("  [1]  RiskPolicy:           ", policyAddr);
  console.log("  [2]  ChainlinkPriceOracle: ", oracleAddr);
  console.log("  [3]  CircuitBreaker:       ", breakerAddr);
  console.log("  [4]  SharpeTracker:        ", sharpeAddr);
  console.log("  [5]  AsterEarnAdapter:     ", asterAddr);
  console.log("  [6]  ManagedAdapter:       ", secAddr);
  console.log("  [7]  LPAdapter:            ", lpAddr);
  console.log("  [8]  ProofVault:           ", vaultAddr);
  console.log("  [9]  StrategyEngine:       ", engineAddr);
  console.log("  [10] PegArbExecutor:       ", pegArbAddr);
  console.log("  [11] ExecutionAuction:     ", auctionAddr);

  console.log(
    "\n── Copy to frontend/lib/contractAddresses.js V2_MAINNET_PRESET ──"
  );
  console.log(`  vaultAddress:            "${vaultAddr}",`);
  console.log(`  engineAddress:           "${engineAddr}",`);
  console.log(`  tokenAddress:            "${BSC_USDT}",  // BSC USDT`);
  console.log(`  circuitBreakerAddress:   "${breakerAddr}",`);
  console.log(`  sharpeTrackerAddress:    "${sharpeAddr}",`);
  console.log(`  pegArbExecutorAddress:   "${pegArbAddr}",`);
  console.log(`  riskPolicyAddress:       "${policyAddr}",`);
  console.log(`  asterAdapterAddress:     "${asterAddr}",`);
  console.log(`  secondaryAdapterAddress: "${secAddr}",`);
  console.log(`  executionAuctionAddress: "${auctionAddr}",`);

  console.log(
    "\n── Next steps ────────────────────────────────────────────────"
  );
  console.log(
    "  1. Update frontend/lib/contractAddresses.js V2_MAINNET_PRESET"
  );
  console.log("  2. Verify contracts on BscScan:");
  console.log(
    `     npx hardhat verify --network bnb ${vaultAddr} "${BSC_USDT}" "AsterPilot ProofVault V2 Share" "apvV2SHARE" "${deployer.address}" ${IDLE_BUFFER_BPS}`
  );
  console.log("  3. Confirm circuit breaker state before first deposit:");
  console.log(
    `     Signal B monitors ${BSC_STABLESWAP} reserve ratio (real mainnet pool).`
  );
  console.log(
    "     If USDF is off-peg, circuit breaker will be tripped on first executeCycle()."
  );
  console.log("  4. Monitor first executeCycle() carefully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
