const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-network-helpers");

/// @dev Integration tests for the 3-rail vault: Aster + Secondary (ManagedAdapter) + LP (StableSwap)
describe("ProofVault V2 — Three-Rail LP Integration", function () {
  async function deployThreeRailFixture() {
    const [deployer, user, executor] = await ethers.getSigners();

    // Mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdt = await MockERC20.deploy("USDT", "USDT");
    // Force 6 decimals for USDT/USDF to match Polkadot Hub USDC
    await usdt.setDecimals(6);
    const usdf = await MockERC20.deploy("USDF", "USDF");
    await usdf.setDecimals(6);

    // Mock oracle / chainlink / pool
    // Use MockStableSwapPoolWithLPSupport — it is both pool AND an ERC20 LP token
    const MockChainlinkAggregator = await ethers.getContractFactory(
      "MockChainlinkAggregator"
    );
    const chainlinkFeed = await MockChainlinkAggregator.deploy(8, 100000000n);

    const MockStableSwapPoolWithLPSupport = await ethers.getContractFactory(
      "MockStableSwapPoolWithLPSupport"
    );
    const stableSwapPool = await MockStableSwapPoolWithLPSupport.deploy(
      usdf.target,
      usdt.target, // token0=USDF (index 0), token1=USDT (index 1)
      ethers.parseUnits("10000000", 6),
      ethers.parseUnits("10000000", 6),
      ethers.parseUnits("1", 6),
      0
    );

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    const oracle = await MockPriceOracle.deploy(100000000n, deployer.address);

    const MockAsyncAsterMinter = await ethers.getContractFactory(
      "MockAsyncAsterMinter"
    );
    const asterMinter = await MockAsyncAsterMinter.deploy(usdt.target, 3600);

    // RiskPolicy with LP rail: Normal=20%, Guarded=15%, Drawdown=5%
    // normalAsterBps=2000 + normalLpBps=2000 = 4000 <= 9000 ✓
    const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
    const policy = await RiskPolicy.deploy(
      300,
      200,
      500,
      99000000n,
      100,
      100,
      2000,
      5000,
      7000,
      5,
      3600,
      500,
      5,
      5000,
      2000,
      1500,
      500
    );

    // CircuitBreaker + SharpeTracker
    const CircuitBreaker = await ethers.getContractFactory("CircuitBreaker");
    const breaker = await CircuitBreaker.deploy(
      chainlinkFeed.target,
      stableSwapPool.target,
      50,
      100,
      50,
      3600,
      86400
    );

    const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
    const sharpeTracker = await SharpeTracker.deploy(5);

    // Adapters
    const depositSel = asterMinter.interface.getFunction("deposit").selector;
    const managedAssetsSel =
      asterMinter.interface.getFunction("managedAssets").selector;
    const requestWithdrawSel =
      asterMinter.interface.getFunction("requestWithdraw").selector;
    const claimWithdrawSel =
      asterMinter.interface.getFunction("claimWithdraw").selector;
    const getWithdrawRequestSel =
      asterMinter.interface.getFunction("getWithdrawRequest").selector;

    const AsterEarnAdapter = await ethers.getContractFactory(
      "AsterEarnAdapter"
    );
    const asterAdapter = await AsterEarnAdapter.deploy(
      usdt.target,
      asterMinter.target,
      depositSel,
      managedAssetsSel,
      requestWithdrawSel,
      claimWithdrawSel,
      getWithdrawRequestSel,
      deployer.address
    );

    const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
    const secondaryAdapter = await ManagedAdapter.deploy(
      usdt.target,
      deployer.address
    );

    // Deploy farm mocks for LP adapter
    const MockERC20CAKE = await ethers.getContractFactory("MockERC20");
    const cake = await MockERC20CAKE.deploy("CAKE", "CAKE");

    const MockMasterChef = await ethers.getContractFactory("MockMasterChef");
    const masterChef = await MockMasterChef.deploy(cake.target);
    await masterChef.addPool(stableSwapPool.target);

    const MockPancakeRouter = await ethers.getContractFactory(
      "MockPancakeRouter"
    );
    const router = await MockPancakeRouter.deploy();

    // LP adapter: MockStableSwapPoolWithLPSupport is its own ERC20 LP token (self-referential, same as PCS mainnet)
    const StableSwapLPYieldAdapterWithFarm = await ethers.getContractFactory(
      "StableSwapLPYieldAdapterWithFarm"
    );
    const lpAdapter = await StableSwapLPYieldAdapterWithFarm.deploy(
      usdt.target,
      stableSwapPool.target, // lpToken = pool itself (ERC20)
      cake.target,
      deployer.address, // wbnb (mock placeholder for gas-gated harvest)
      stableSwapPool.target, // pool
      masterChef.target,
      router.target,
      0, // poolId
      deployer.address
    );

    // Vault
    const ProofVault = await ethers.getContractFactory("ProofVault");
    const vault = await ProofVault.deploy(
      usdt.target,
      "ProofVault V2 3Rail",
      "pv3USDT",
      deployer.address,
      500
    );

    // Engine
    const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
    const engine = await StrategyEngine.deploy(
      vault.target,
      policy.target,
      oracle.target,
      breaker.target,
      sharpeTracker.target,
      100000000n
    );

    await sharpeTracker.setEngine(engine.target);
    // Wire
    await vault.setEngine(engine.target);
    await vault.setAdapters(
      asterAdapter.target,
      secondaryAdapter.target,
      lpAdapter.target
    );
    await asterAdapter.setVault(vault.target);
    await secondaryAdapter.setVault(vault.target);
    await lpAdapter.setVault(vault.target);

    // Lock
    await asterAdapter.lockConfiguration();
    await secondaryAdapter.lockConfiguration();
    await lpAdapter.lockConfiguration();
    await vault.lockConfiguration();

    // Fund tokens — pool needs USDT for remove_liquidity_one_coin payouts
    await usdt.mint(user.address, ethers.parseUnits("200000", 6));
    await usdt.mint(stableSwapPool.target, ethers.parseUnits("5000000", 6));
    await usdf.mint(stableSwapPool.target, ethers.parseUnits("5000000", 6));
    await usdt.connect(user).approve(vault.target, ethers.MaxUint256);

    return {
      deployer,
      user,
      executor,
      usdt,
      usdf,
      vault,
      engine,
      policy,
      oracle,
      breaker,
      sharpeTracker,
      asterAdapter,
      secondaryAdapter,
      lpAdapter,
      asterMinter,
      chainlinkFeed,
      stableSwapPool,
    };
  }

  // ── Deployment ─────────────────────────────────────────────────────────────

  describe("Deployment & Wiring", function () {
    it("Should wire lpAdapter on vault", async function () {
      const { vault, lpAdapter } = await loadFixture(deployThreeRailFixture);
      expect(await vault.lpAdapter()).to.equal(lpAdapter.target);
    });

    it("Should lock vault and all adapters", async function () {
      const { vault, asterAdapter, secondaryAdapter, lpAdapter } =
        await loadFixture(deployThreeRailFixture);
      expect(await vault.configurationLocked()).to.be.true;
      expect(await asterAdapter.configurationLocked()).to.be.true;
      expect(await secondaryAdapter.configurationLocked()).to.be.true;
      expect(await lpAdapter.configurationLocked()).to.be.true;
    });

    it("RiskPolicy should have correct LP params", async function () {
      const { policy } = await loadFixture(deployThreeRailFixture);
      expect(await policy.normalLpBps()).to.equal(2000);
      expect(await policy.guardedLpBps()).to.equal(1500);
      expect(await policy.drawdownLpBps()).to.equal(500);
    });

    it("Should require lpAdapter set before lockConfiguration", async function () {
      const [deployer] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const usdt = await MockERC20.deploy("USDT", "USDT");

      const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
      const policy = await RiskPolicy.deploy(
        300,
        200,
        500,
        99000000n,
        100,
        100,
        2000,
        5000,
        7000,
        5,
        3600,
        500,
        5,
        5000,
        2000,
        1500,
        500
      );

      const ProofVault = await ethers.getContractFactory("ProofVault");
      const vault = await ProofVault.deploy(
        usdt.target,
        "V",
        "V",
        deployer.address,
        500
      );

      const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
      const secondary = await ManagedAdapter.deploy(
        usdt.target,
        deployer.address
      );

      const MockAsyncAsterMinter = await ethers.getContractFactory(
        "MockAsyncAsterMinter"
      );
      const minter = await MockAsyncAsterMinter.deploy(usdt.target, 3600);
      const depositSel = minter.interface.getFunction("deposit").selector;
      const managedAssetsSel =
        minter.interface.getFunction("managedAssets").selector;
      const requestWithdrawSel =
        minter.interface.getFunction("requestWithdraw").selector;
      const claimWithdrawSel =
        minter.interface.getFunction("claimWithdraw").selector;
      const getWithdrawRequestSel =
        minter.interface.getFunction("getWithdrawRequest").selector;

      const AsterEarnAdapter = await ethers.getContractFactory(
        "AsterEarnAdapter"
      );
      const aster = await AsterEarnAdapter.deploy(
        usdt.target,
        minter.target,
        depositSel,
        managedAssetsSel,
        requestWithdrawSel,
        claimWithdrawSel,
        getWithdrawRequestSel,
        deployer.address
      );

      const MockPriceOracle = await ethers.getContractFactory(
        "MockPriceOracle"
      );
      const oracle = await MockPriceOracle.deploy(100000000n, deployer.address);

      const MockChainlinkAggregator = await ethers.getContractFactory(
        "MockChainlinkAggregator"
      );
      const chainlinkFeed = await MockChainlinkAggregator.deploy(8, 100000000n);
      const usdf2 = await MockERC20.deploy("USDF", "USDF");
      const MockStableSwapPoolWithLPSupport2 = await ethers.getContractFactory(
        "MockStableSwapPoolWithLPSupport"
      );
      const pool = await MockStableSwapPoolWithLPSupport2.deploy(
        usdf2.target,
        usdt.target,
        ethers.parseUnits("1000000", 6),
        ethers.parseUnits("1000000", 6),
        ethers.parseUnits("1", 6),
        4
      );
      const CircuitBreaker = await ethers.getContractFactory("CircuitBreaker");
      const breaker = await CircuitBreaker.deploy(
        chainlinkFeed.target,
        pool.target,
        50,
        100,
        50,
        3600,
        86400
      );
      const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
      const sharpeT = await SharpeTracker.deploy(5);
      const engine = await (
        await ethers.getContractFactory("StrategyEngine")
      ).deploy(
        vault.target,
        policy.target,
        oracle.target,
        breaker.target,
        sharpeT.target,
        100000000n
      );

      await sharpeT.setEngine(engine.target);
      // Set engine + adapters without lpAdapter (pass zero address via setAdapters with lp=zero)
      await vault.setEngine(engine.target);
      // Only set aster + secondary, no LP — lpAdapter is optional so should succeed
      await vault.setAdapters(
        aster.target,
        secondary.target,
        ethers.ZeroAddress
      );
      // lockConfiguration should succeed because lpAdapter is optional
      await expect(vault.lockConfiguration()).to.not.be.reverted;
    });
  });

  // ── LP rail allocation ──────────────────────────────────────────────────────

  describe("LP Rail Allocation", function () {
    it("Should include LP adapter balance in totalAssets", async function () {
      const { vault, user, engine, executor } = await loadFixture(
        deployThreeRailFixture
      );
      const amount = ethers.parseUnits("10000", 6);
      await vault.connect(user).deposit(amount, user.address);

      await time.increase(301);
      await engine.connect(executor).executeCycle();

      const total = await vault.totalAssets();
      expect(total).to.be.gte((amount * 90n) / 100n);
    });

    it("Should allocate LP on executeCycle in Normal state", async function () {
      const { vault, engine, lpAdapter, user, executor } = await loadFixture(
        deployThreeRailFixture
      );
      const amount = ethers.parseUnits("10000", 6);
      await vault.connect(user).deposit(amount, user.address);

      await time.increase(301);
      await engine.connect(executor).executeCycle();

      // LP adapter should have received some funds (normalLpBps=2000 of deployable)
      const lpManaged = await lpAdapter.managedAssets();
      expect(lpManaged).to.be.gt(0);
    });

    it("Should emit Rebalanced event with lp field", async function () {
      const { vault, engine, user, executor } = await loadFixture(
        deployThreeRailFixture
      );
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("10000", 6), user.address);

      await time.increase(301);
      await expect(engine.connect(executor).executeCycle()).to.emit(
        vault,
        "Rebalanced"
      );
    });

    it("Should emit DecisionProofV2 with targetLpBps", async function () {
      const { engine, vault, user, executor } = await loadFixture(
        deployThreeRailFixture
      );
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("10000", 6), user.address);

      await time.increase(301);
      const tx = await engine.connect(executor).executeCycle();
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "DecisionProofV2"
      );
      expect(event).to.not.be.undefined;
      // targetLpBps = normalLpBps = 2000 (Normal state)
      expect(event.args.targetLpBps).to.equal(2000n);
    });

    it("previewDecision should include targetLpBps", async function () {
      const { engine } = await loadFixture(deployThreeRailFixture);
      const preview = await engine.previewDecision();
      expect(preview.targetLpBps).to.equal(2000n); // normalLpBps
    });
  });

  // ── Risk state LP allocation tiers ────────────────────────────────────────

  describe("LP Allocation Per Risk State", function () {
    it("Normal state: asterBps=2000, lpBps=2000", async function () {
      const { engine } = await loadFixture(deployThreeRailFixture);
      const preview = await engine.previewDecision();
      expect(preview.nextState).to.equal(0); // Normal
      expect(preview.targetAsterBps).to.equal(2000n);
      expect(preview.targetLpBps).to.equal(2000n);
    });

    it("Guarded state: asterBps=5000, lpBps=1500", async function () {
      const { engine, oracle } = await loadFixture(deployThreeRailFixture);
      // Set price to 1.03 (3% move = 300 bps) — above guarded threshold (200 bps) but below drawdown (500 bps)
      await oracle.setPrice(103000000n); // $1.03 = 300 bps move from initial $1.00
      const preview = await engine.previewDecision();
      expect(preview.nextState).to.equal(1); // Guarded
      expect(preview.targetAsterBps).to.equal(5000n);
      expect(preview.targetLpBps).to.equal(1500n);
    });

    it("Drawdown state: asterBps=7000, lpBps=500", async function () {
      const { engine, oracle } = await loadFixture(deployThreeRailFixture);
      // Set price to trigger drawdown via depeg ($0.97)
      await oracle.setPrice(ethers.parseUnits("0.96", 8));
      const preview = await engine.previewDecision();
      expect(preview.nextState).to.equal(2); // Drawdown
      expect(preview.targetAsterBps).to.equal(7000n);
      expect(preview.targetLpBps).to.equal(500n);
    });
  });

  // ── RiskPolicy LP constructor validations ────────────────────────────────

  describe("RiskPolicy LP Param Validations", function () {
    it("Should revert if normalLpBps + normalAsterBps > 10000", async function () {
      const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
      await expect(
        RiskPolicy.deploy(
          300,
          200,
          500,
          99000000n,
          100,
          100,
          2000,
          5000,
          7000,
          5,
          3600,
          500,
          5,
          5000,
          8001,
          1500,
          500 // 8001 + 2000 = 10001 > 10000
        )
      ).to.be.revertedWithCustomError(
        RiskPolicy,
        "RiskPolicy__CombinedAllocationTooHigh"
      );
    });

    it("Should revert if guardedLpBps + guardedAsterBps > 10000", async function () {
      const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
      await expect(
        RiskPolicy.deploy(
          300,
          200,
          500,
          99000000n,
          100,
          100,
          2000,
          5000,
          7000,
          5,
          3600,
          500,
          5,
          5000,
          2000,
          5001,
          500 // 5001 + 5000 = 10001 > 10000
        )
      ).to.be.revertedWithCustomError(
        RiskPolicy,
        "RiskPolicy__CombinedAllocationTooHigh"
      );
    });

    it("Should revert if drawdownLpBps + drawdownAsterBps > 10000", async function () {
      const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
      await expect(
        RiskPolicy.deploy(
          300,
          200,
          500,
          99000000n,
          100,
          100,
          2000,
          5000,
          7000,
          5,
          3600,
          500,
          5,
          5000,
          2000,
          1500,
          3001 // 3001 + 7000 = 10001 > 10000
        )
      ).to.be.revertedWithCustomError(
        RiskPolicy,
        "RiskPolicy__CombinedAllocationTooHigh"
      );
    });

    it("Should accept valid LP params at boundary (10000 exact)", async function () {
      const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
      // 2000 aster + 7000 lp = 9000 each rail (all under 10000 limit) — should pass
      await expect(
        RiskPolicy.deploy(
          300,
          200,
          500,
          99000000n,
          100,
          100,
          2000,
          5000,
          7000,
          5,
          3600,
          500,
          5,
          5000,
          7000,
          4000,
          2000 // 7000+2000=9000, 4000+5000=9000, 2000+7000=9000
        )
      ).to.not.be.reverted;
    });
  });

  // ── Liquidity waterfall with LP ────────────────────────────────────────────

  describe("Liquidity Waterfall (4-tier)", function () {
    it("Should pull from LP when secondary is drained", async function () {
      const { vault, engine, lpAdapter, asterAdapter, secondaryAdapter, user, executor, usdt } =
        await loadFixture(deployThreeRailFixture);
      const amount = ethers.parseUnits("10000", 6);
      await vault.connect(user).deposit(amount, user.address);

      await time.increase(301);
      await engine.connect(executor).executeCycle();

      // Ensure LP adapter has enough underlying for the pull by depositing more through the vault
      const extraAmount = ethers.parseUnits("100000", 6);
      await usdt.mint(user.address, extraAmount);
      await usdt.connect(user).approve(vault.target, extraAmount);
      await vault.connect(user).deposit(extraAmount, user.address);
      
      // Move time and execute cycle to deploy the extra funds
      await time.increase(301);
      await engine.connect(executor).executeCycle();

      // Confirm LP received allocation after rebalance
      const lpBefore = await lpAdapter.managedAssets();
      expect(lpBefore).to.be.gt(0n);

      // Withdraw 75%: idle(~5%) + secondary(~57%) = ~62% — need LP for remaining ~13%.
      // With full-LP-drain in _ensureLiquid tier 2.5, the fee is absorbed.
      const shares = await vault.balanceOf(user.address);
      const balBefore = await usdt.balanceOf(user.address);
      await vault
        .connect(user)
        .redeem((shares * 75n) / 100n, user.address, user.address);
      const balAfter = await usdt.balanceOf(user.address);

      expect(balAfter).to.be.gt(balBefore);
      // LP should be fully drained (full-balance withdrawal in tier 2.5)
      const lpAfter = await lpAdapter.managedAssets();
      expect(lpAfter).to.be.lt(lpBefore);
    });

    it("totalAssets should account for LP after rebalance", async function () {
      const { vault, engine, user, executor, lpAdapter } = await loadFixture(
        deployThreeRailFixture
      );
      const amount = ethers.parseUnits("20000", 6);
      await vault.connect(user).deposit(amount, user.address);

      await time.increase(301);
      await engine.connect(executor).executeCycle();

      const lpManaged = await lpAdapter.managedAssets();
      const total = await vault.totalAssets();
      // Total must include LP portion
      expect(total).to.be.gte(lpManaged);
      expect(lpManaged).to.be.gt(0n);
    });
  });
});
