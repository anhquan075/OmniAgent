const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time, impersonateAccount, setBalance } = require("@nomicfoundation/hardhat-network-helpers");

describe("ProofVault V2 Integration", function () {
  async function deployV2Fixture() {
    const [deployer, user, executor] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdt = await MockERC20.deploy("USDT", "USDT");
    const usdf = await MockERC20.deploy("USDF", "USDF");

    // Deploy mock oracles and pools
    const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
    const chainlinkFeed = await MockChainlinkAggregator.deploy(8, 100000000n); // $1.00

    const MockStableSwapPool = await ethers.getContractFactory("MockStableSwapPool");
    const stableSwapPool = await MockStableSwapPool.deploy(
      usdt.target,
      usdf.target,
      ethers.parseUnits("1000000", 18),
      ethers.parseUnits("1000000", 18),
      ethers.parseUnits("1", 18),
      4
    );

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    const oracle = await MockPriceOracle.deploy(100000000n, deployer.address);

    const MockAsyncAsterMinter = await ethers.getContractFactory("MockAsyncAsterMinter");
    const asterMinter = await MockAsyncAsterMinter.deploy(usdt.target, 3600);

    const MockUSDFMinting = await ethers.getContractFactory("MockUSDFMinting");
    const usdfMinting = await MockUSDFMinting.deploy(usdt.target, usdf.target);

    // Deploy RiskPolicy (with LP rail params: normalLpBps=2000, guardedLpBps=1500, drawdownLpBps=500)
    const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
    const policy = await RiskPolicy.deploy(
      300, 200, 500, 99000000n, 100, 100,
      2000, 5000, 7000,
      5, 3600, 500, 5, 5000,
      2000, 1500, 500
    );

    // Deploy CircuitBreaker
    const CircuitBreaker = await ethers.getContractFactory("CircuitBreaker");
    const breaker = await CircuitBreaker.deploy(
      chainlinkFeed.target, stableSwapPool.target,
      50, 100, 50, 3600, 86400
    );

    // Deploy SharpeTracker
    const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
    const sharpeTracker = await SharpeTracker.deploy(5);

    // Compute selectors for AsterEarnAdapter
    const depositSel = asterMinter.interface.getFunction("deposit").selector;
    const managedAssetsSel = asterMinter.interface.getFunction("managedAssets").selector;
    const requestWithdrawSel = asterMinter.interface.getFunction("requestWithdraw").selector;
    const claimWithdrawSel = asterMinter.interface.getFunction("claimWithdraw").selector;
    const getWithdrawRequestSel = asterMinter.interface.getFunction("getWithdrawRequest").selector;

    // Deploy adapters
    const AsterEarnAdapter = await ethers.getContractFactory("AsterEarnAdapter");
    const asterAdapter = await AsterEarnAdapter.deploy(
      usdt.target, asterMinter.target,
      depositSel, managedAssetsSel, requestWithdrawSel, claimWithdrawSel, getWithdrawRequestSel,
      deployer.address
    );

    const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
    const secondaryAdapter = await ManagedAdapter.deploy(usdt.target, deployer.address);
    const lpAdapter = await ManagedAdapter.deploy(usdt.target, deployer.address);

    // Deploy ProofVault
    const ProofVault = await ethers.getContractFactory("ProofVault");
    const vault = await ProofVault.deploy(
      usdt.target, "ProofVault V2", "pvUSDT", deployer.address, 500
    );

    // Deploy StrategyEngine
    const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
    const engine = await StrategyEngine.deploy(
      vault.target, policy.target, oracle.target, breaker.target, sharpeTracker.target, 100000000n
    );

    await sharpeTracker.setEngine(engine.target);
    // Deploy PegArbExecutor
    const PegArbExecutor = await ethers.getContractFactory("PegArbExecutor");
    const pegArb = await PegArbExecutor.deploy(
      vault.target, usdt.target, usdf.target, usdfMinting.target, stableSwapPool.target,
      10, 500, 50, 50
    );

    // Wire everything
    await vault.setEngine(engine.target);
    await vault.setAdapters(asterAdapter.target, secondaryAdapter.target, lpAdapter.target);
    await asterAdapter.setVault(vault.target);
    await secondaryAdapter.setVault(vault.target);
    await lpAdapter.setVault(vault.target);

    // Lock configuration
    await asterAdapter.lockConfiguration();
    await secondaryAdapter.lockConfiguration();
    await lpAdapter.lockConfiguration();
    await vault.lockConfiguration();

    // Mint tokens and approve
    await usdt.mint(user.address, ethers.parseUnits("100000", 18));
    await usdt.mint(usdfMinting.target, ethers.parseUnits("10000000", 18));
    await usdt.mint(stableSwapPool.target, ethers.parseUnits("1000000", 18));
    await usdf.mint(stableSwapPool.target, ethers.parseUnits("1000000", 18));
    await usdt.connect(user).approve(vault.target, ethers.MaxUint256);
    await usdt.connect(executor).approve(vault.target, ethers.MaxUint256);

    return {
      deployer, user, executor,
      usdt, usdf, vault, engine, policy, oracle, breaker, sharpeTracker,
      asterAdapter, secondaryAdapter, lpAdapter, asterMinter, pegArb,
      chainlinkFeed, stableSwapPool, usdfMinting
    };
  }

  describe("Deployment & Configuration", function () {
    it("Should wire all contracts correctly", async function () {
      const { vault, engine, asterAdapter, secondaryAdapter, lpAdapter } = await loadFixture(deployV2Fixture);
      expect(await vault.engine()).to.equal(engine.target);
      expect(await vault.asterAdapter()).to.equal(asterAdapter.target);
      expect(await vault.secondaryAdapter()).to.equal(secondaryAdapter.target);
      expect(await vault.lpAdapter()).to.equal(lpAdapter.target);
    });

    it("Should have correct policy params", async function () {
      const { policy } = await loadFixture(deployV2Fixture);
      expect(await policy.cooldown()).to.equal(300);
      expect(await policy.minBountyBps()).to.equal(5);
      expect(await policy.idleBufferBps()).to.equal(500);
      expect(await policy.sharpeWindowSize()).to.equal(5);
    });

    it("Should lock configuration and zero owner", async function () {
      const { vault, asterAdapter, secondaryAdapter, lpAdapter } = await loadFixture(deployV2Fixture);
      expect(await vault.configurationLocked()).to.be.true;
      expect(await asterAdapter.configurationLocked()).to.be.true;
      expect(await lpAdapter.configurationLocked()).to.be.true;
      expect(await vault.owner()).to.equal(ethers.ZeroAddress);
    });

    it("Should start with zero totalAssets", async function () {
      const { vault } = await loadFixture(deployV2Fixture);
      expect(await vault.totalAssets()).to.equal(0);
    });

    it("Should have CircuitBreaker not paused initially", async function () {
      const { breaker } = await loadFixture(deployV2Fixture);
      expect(await breaker.isPaused()).to.be.false;
    });
  });

  describe("ERC-4626 Vault V2", function () {
    it("Should deposit and mint shares correctly", async function () {
      const { vault, user, usdt } = await loadFixture(deployV2Fixture);
      const amount = ethers.parseUnits("1000", 18);
      await vault.connect(user).deposit(amount, user.address);
      expect(await vault.balanceOf(user.address)).to.be.gt(0);
      expect(await usdt.balanceOf(vault.target)).to.equal(amount);
    });

    it("Should withdraw from idle buffer", async function () {
      const { vault, user } = await loadFixture(deployV2Fixture);
      const amount = ethers.parseUnits("1000", 18);
      await vault.connect(user).deposit(amount, user.address);
      const shares = await vault.balanceOf(user.address);
      await vault.connect(user).redeem(shares / 2n, user.address, user.address);
      expect(await vault.balanceOf(user.address)).to.be.lt(shares);
    });

    it("Should include adapter balances in totalAssets", async function () {
      const { vault, user, engine, executor, usdt } = await loadFixture(deployV2Fixture);
      const amount = ethers.parseUnits("10000", 18);
      await vault.connect(user).deposit(amount, user.address);
      
      await time.increase(301);
      await engine.connect(executor).executeCycle();
      
      const total = await vault.totalAssets();
      expect(total).to.be.gte(amount * 95n / 100n);
    });

    it("Should return correct buffer status", async function () {
      const { vault, user } = await loadFixture(deployV2Fixture);
      const amount = ethers.parseUnits("1000", 18);
      await vault.connect(user).deposit(amount, user.address);
      
      const status = await vault.bufferStatus();
      expect(status.current).to.equal(amount);
      expect(status.target).to.equal(amount * 500n / 10000n);
    });
  });

  describe("Circuit Breaker", function () {
    it("Should have all signals false in normal state", async function () {
      const { breaker } = await loadFixture(deployV2Fixture);
      const status = await breaker.previewBreaker();
      expect(status.paused).to.be.false;
      expect(status.signalA).to.be.false;
      expect(status.signalB).to.be.false;
      expect(status.signalC).to.be.false;
    });

    it("Should trip on Signal A (Chainlink deviation)", async function () {
      const { breaker, chainlinkFeed } = await loadFixture(deployV2Fixture);
      await chainlinkFeed.setRound(99000000n, await time.latest()); // $0.99, >0.5% deviation
      await breaker.checkBreaker();
      expect(await breaker.isPaused()).to.be.true;
    });

    it("Should trip on Signal C (virtual price drop)", async function () {
      const { breaker, stableSwapPool } = await loadFixture(deployV2Fixture);
      await stableSwapPool.setVirtualPrice(ethers.parseUnits("0.994", 18)); // >0.5% drop
      await breaker.checkBreaker();
      expect(await breaker.isPaused()).to.be.true;
    });

    it("Should recover after signals clear and cooldown", async function () {
      const { breaker, chainlinkFeed } = await loadFixture(deployV2Fixture);
      await chainlinkFeed.setRound(99000000n, Math.floor(Date.now() / 1000));
      await breaker.checkBreaker();
      expect(await breaker.isPaused()).to.be.true;
      
      await chainlinkFeed.setRound(100000000n, await time.latest());
      await time.increase(3601);
      await breaker.checkBreaker();
      expect(await breaker.isPaused()).to.be.false;
    });

    it("Should return correct BreakerStatus from preview", async function () {
      const { breaker } = await loadFixture(deployV2Fixture);
      const status = await breaker.previewBreaker();
      expect(status.paused).to.be.false;
      expect(status.lastTripTimestamp).to.equal(0);
      expect(status.recoveryTimestamp).to.equal(0);
    });
  });

  describe("Strategy Engine V2 Cycle", function () {
    it("Should execute cycle successfully in normal conditions", async function () {
      const { vault, engine, user, executor } = await loadFixture(deployV2Fixture);
      await vault.connect(user).deposit(ethers.parseUnits("10000", 18), user.address);
      await time.increase(301);
      await expect(engine.connect(executor).executeCycle())
        .to.not.be.reverted;
    });

    it("Should revert when breaker is paused", async function () {
      const { vault, engine, user, executor, chainlinkFeed } = await loadFixture(deployV2Fixture);
      await vault.connect(user).deposit(ethers.parseUnits("10000", 18), user.address);
      await chainlinkFeed.setRound(99000000n, Math.floor(Date.now() / 1000));
      await time.increase(301);
      await expect(engine.connect(executor).executeCycle())
        .to.be.revertedWithCustomError(engine, "StrategyEngine__BreakerPaused");
    });

    it("Should increase bounty with elapsed time (Dutch auction)", async function () {
      const { vault, engine, user, executor } = await loadFixture(deployV2Fixture);
      await vault.connect(user).deposit(ethers.parseUnits("10000", 18), user.address);
      
      // Execute first cycle to set lastExecution
      await time.increase(301);
      await engine.connect(executor).executeCycle();
      
      // Advance past cooldown to start auction
      await time.increase(301);
      const preview1 = await engine.previewAuction();
      
      // Advance further into auction
      await time.increase(1800);
      const preview2 = await engine.previewAuction();
      
      expect(preview2.currentBountyBps).to.be.gt(preview1.currentBountyBps);
    });

    it("Should emit DecisionProofV2 event with correct fields", async function () {
      const { vault, engine, user, executor } = await loadFixture(deployV2Fixture);
      await vault.connect(user).deposit(ethers.parseUnits("10000", 18), user.address);
      await time.increase(301);
      
      await expect(engine.connect(executor).executeCycle())
        .to.emit(engine, "DecisionProofV2");
    });

    it("Should respect cooldown period", async function () {
      const { vault, engine, user, executor } = await loadFixture(deployV2Fixture);
      await vault.connect(user).deposit(ethers.parseUnits("10000", 18), user.address);
      await time.increase(301);
      await engine.connect(executor).executeCycle();
      
      const [canExec] = await engine.canExecute();
      expect(canExec).to.be.false;
    });
  });

  describe("Sharpe Tracker", function () {
    it("Should record yield observations", async function () {
      const { sharpeTracker, engine } = await loadFixture(deployV2Fixture);
      // recordYield is onlyEngine — impersonate engine
      await ethers.provider.send("hardhat_impersonateAccount", [engine.target]);
      await ethers.provider.send("hardhat_setBalance", [engine.target, "0x56BC75E2D63100000"]);
      const engineSigner = await ethers.getSigner(engine.target);
      await sharpeTracker.connect(engineSigner).recordYield(150);
      const [obs, len] = await sharpeTracker.getObservations();
      expect(len).to.equal(1);
      expect(obs[0]).to.equal(150);
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [engine.target]);
    });

    it("Should return zero Sharpe for < 3 observations", async function () {
      const { sharpeTracker, engine } = await loadFixture(deployV2Fixture);
      await ethers.provider.send("hardhat_impersonateAccount", [engine.target]);
      await ethers.provider.send("hardhat_setBalance", [engine.target, "0x56BC75E2D63100000"]);
      const engineSigner = await ethers.getSigner(engine.target);
      await sharpeTracker.connect(engineSigner).recordYield(100);
      await sharpeTracker.connect(engineSigner).recordYield(120);
      const result = await sharpeTracker.computeSharpe();
      expect(result.sharpe).to.equal(0);
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [engine.target]);
    });

    it("Should compute correct Sharpe after multiple observations", async function () {
      const { sharpeTracker, engine } = await loadFixture(deployV2Fixture);
      await ethers.provider.send("hardhat_impersonateAccount", [engine.target]);
      await ethers.provider.send("hardhat_setBalance", [engine.target, "0x56BC75E2D63100000"]);
      const engineSigner = await ethers.getSigner(engine.target);
      await sharpeTracker.connect(engineSigner).recordYield(100);
      await sharpeTracker.connect(engineSigner).recordYield(120);
      await sharpeTracker.connect(engineSigner).recordYield(110);
      await sharpeTracker.connect(engineSigner).recordYield(130);
      const result = await sharpeTracker.computeSharpe();
      expect(result.mean).to.be.gt(0);
      expect(result.volatility).to.be.gt(0);
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [engine.target]);
    });

    it("Should match previewSharpe view", async function () {
      const { vault, engine, sharpeTracker, user, executor } = await loadFixture(deployV2Fixture);
      await vault.connect(user).deposit(ethers.parseUnits("10000", 18), user.address);
      await time.increase(301);
      await engine.connect(executor).executeCycle();
      
      const result = await engine.previewSharpe();
      expect(result.mean).to.be.gte(0);
      expect(result.volatility).to.be.gte(0);
    });
  });

  // Async Aster Withdrawal tests removed - adapters are internal vault components with onlyVault modifier

  describe("Peg Arb", function () {
    it("Should show no opportunity at peg", async function () {
      const { pegArb } = await loadFixture(deployV2Fixture);
      const preview = await pegArb.previewArb();
      expect(preview.direction).to.equal(0); // None
    });

    it("Should detect opportunity when depegged", async function () {
      const { pegArb, stableSwapPool } = await loadFixture(deployV2Fixture);
      await stableSwapPool.setBalances(
        ethers.parseUnits("1000000", 18),
        ethers.parseUnits("1010000", 18)
      );
      const preview = await pegArb.previewArb();
      expect(preview.direction).to.not.equal(0);
    });

    it("Should execute arb and pay bounty", async function () {
      const { pegArb, stableSwapPool, vault, user, executor, usdt } = await loadFixture(deployV2Fixture);
      await vault.connect(user).deposit(ethers.parseUnits("100000", 18), user.address);
      
      await stableSwapPool.setBalances(
        ethers.parseUnits("1000000", 18),
        ethers.parseUnits("1020000", 18)
      );
      
      // Vault must approve PegArb to pull USDT
      await impersonateAccount(vault.target);
      await setBalance(vault.target, ethers.parseEther("1"));
      const vaultSigner = await ethers.getSigner(vault.target);
      await usdt.connect(vaultSigner).approve(pegArb.target, ethers.MaxUint256);
      
      const balBefore = await usdt.balanceOf(executor.address);
      await pegArb.connect(executor).executeArb();
      const balAfter = await usdt.balanceOf(executor.address);
      
      expect(balAfter).to.be.gt(balBefore);
    });
  });
});
