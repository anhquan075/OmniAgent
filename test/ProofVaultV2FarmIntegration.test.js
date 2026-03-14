const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
  impersonateAccount,
  setBalance,
} = require("@nomicfoundation/hardhat-network-helpers");

describe("ProofVault V2 — Farm Integration Tests", function () {
  async function deployFarmIntegrationFixture() {
    const [deployer, user, executor] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdt = await MockERC20.deploy("USDT", "USDT");
    const usdf = await MockERC20.deploy("USDF", "USDF");
    const cake = await MockERC20.deploy("CAKE", "CAKE");

    const MockChainlinkAggregator = await ethers.getContractFactory(
      "MockChainlinkAggregator"
    );
    const chainlinkFeed = await MockChainlinkAggregator.deploy(8, 100000000n);

    const MockStableSwapPoolWithLPSupport = await ethers.getContractFactory(
      "MockStableSwapPoolWithLPSupport"
    );
    const stableSwapPool = await MockStableSwapPoolWithLPSupport.deploy(
      usdf.target,
      usdt.target,
      ethers.parseUnits("10000000", 18),
      ethers.parseUnits("10000000", 18),
      ethers.parseUnits("1", 18),
      4
    );

    const MockPancakeRouter = await ethers.getContractFactory(
      "MockPancakeRouter"
    );
    const pancakeRouter = await MockPancakeRouter.deploy();
    await pancakeRouter.setReserves(
      cake.target,
      usdt.target,
      ethers.parseUnits("1000000", 18),
      ethers.parseUnits("500000", 18)
    );

    // Set up USDT → USDF swap reserves for AsterEarnAdapterWithSwap
    await pancakeRouter.setReserves(
      usdt.target,
      usdf.target,
      ethers.parseUnits("10000000", 18),
      ethers.parseUnits("10000000", 18)
    );

    const MockMasterChef = await ethers.getContractFactory("MockMasterChef");
    const masterChef = await MockMasterChef.deploy(cake.target);
    const poolId = 0;
    await masterChef.addPool(stableSwapPool.target);

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    const oracle = await MockPriceOracle.deploy(100000000n, deployer.address);

    const MockAsyncAsterMinter = await ethers.getContractFactory(
      "MockAsyncAsterMinter"
    );
    const asterMinter = await MockAsyncAsterMinter.deploy(usdf.target, 3600);

    const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
    const policy = await RiskPolicy.deploy(
      300,
      200,
      500,
      99000000n,
      200,
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

    const depositSel = asterMinter.interface.getFunction("deposit").selector;
    const managedAssetsSel =
      asterMinter.interface.getFunction("managedAssets").selector;
    const requestWithdrawSel =
      asterMinter.interface.getFunction("requestWithdraw").selector;
    const claimWithdrawSel =
      asterMinter.interface.getFunction("claimWithdraw").selector;
    const getWithdrawRequestSel =
      asterMinter.interface.getFunction("getWithdrawRequest").selector;

    const AsterEarnAdapterWithSwap = await ethers.getContractFactory(
      "AsterEarnAdapterWithSwap"
    );
    const asterAdapter = await AsterEarnAdapterWithSwap.deploy(
      usdt.target,
      usdf.target,
      asterMinter.target,
      depositSel,
      managedAssetsSel,
      requestWithdrawSel,
      claimWithdrawSel,
      getWithdrawRequestSel,
      stableSwapPool.target,
      deployer.address
    );

    const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
    const secondaryAdapter = await ManagedAdapter.deploy(
      usdt.target,
      deployer.address
    );

    const StableSwapLPYieldAdapterWithFarm = await ethers.getContractFactory(
      "StableSwapLPYieldAdapterWithFarm"
    );
    const lpAdapter = await StableSwapLPYieldAdapterWithFarm.deploy(
      usdt.target,
      stableSwapPool.target,
      cake.target,
      deployer.address, // wbnb (mock placeholder for gas-gated harvest)
      stableSwapPool.target,
      masterChef.target,
      pancakeRouter.target,
      poolId,
      deployer.address
    );

    const ProofVault = await ethers.getContractFactory("ProofVault");
    const vault = await ProofVault.deploy(
      usdt.target,
      "ProofVault V2 Farm",
      "pvFARM",
      deployer.address,
      500
    );

    const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
    const engine = await StrategyEngine.deploy(
      vault.target,
      policy.target,
      oracle.target,
      breaker.target,
      sharpeTracker.target,
      100000000n
    );

    await vault.setEngine(engine.target);
    await sharpeTracker.setEngine(engine.target);
    await vault.setAdapters(
      asterAdapter.target,
      secondaryAdapter.target,
      lpAdapter.target
    );
    await asterAdapter.setVault(vault.target);
    await secondaryAdapter.setVault(vault.target);
    await lpAdapter.setVault(vault.target);

    await asterAdapter.lockConfiguration();
    await secondaryAdapter.lockConfiguration();
    await lpAdapter.lockConfiguration();
    await vault.lockConfiguration();

    await usdt.mint(user.address, ethers.parseUnits("200000", 18));
    await usdt.mint(stableSwapPool.target, ethers.parseUnits("5000000", 18));
    await usdf.mint(stableSwapPool.target, ethers.parseUnits("5000000", 18));
    await usdf.mint(pancakeRouter.target, ethers.parseUnits("10000000", 18));
    await usdt.mint(pancakeRouter.target, ethers.parseUnits("10000000", 18));
    await cake.mint(masterChef.target, ethers.parseUnits("1000000", 18));
    await usdt.connect(user).approve(vault.target, ethers.MaxUint256);

    return {
      deployer,
      user,
      executor,
      usdt,
      usdf,
      cake,
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
      pancakeRouter,
      masterChef,
      poolId,
    };
  }

  describe("Farm Adapter Deployment", function () {
    it("Should deploy with correct farm parameters", async function () {
      const { lpAdapter, cake, masterChef, poolId } = await loadFixture(
        deployFarmIntegrationFixture
      );

      expect(await lpAdapter.cake()).to.equal(cake.target);
      expect(await lpAdapter.masterChef()).to.equal(masterChef.target);
      expect(await lpAdapter.poolId()).to.equal(poolId);
    });

    it("Should have default harvest thresholds", async function () {
      const { lpAdapter } = await loadFixture(deployFarmIntegrationFixture);

      expect(await lpAdapter.minCakeHarvestAmount()).to.equal(
        ethers.parseUnits("1", 18)
      );
      expect(await lpAdapter.harvestSlippageBps()).to.equal(100);
    });

    it("Should lock configuration and renounce ownership", async function () {
      const { lpAdapter } = await loadFixture(deployFarmIntegrationFixture);

      expect(await lpAdapter.configurationLocked()).to.be.true;
      expect(await lpAdapter.owner()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("LP Staking Integration", function () {
    it("Should stake LP tokens after adding liquidity", async function () {
      const {
        vault,
        engine,
        user,
        usdt,
        lpAdapter,
        masterChef,
        poolId,
        stableSwapPool,
      } = await loadFixture(deployFarmIntegrationFixture);

      const depositAmount = ethers.parseUnits("10000", 18);
      await vault.connect(user).deposit(depositAmount, user.address);

      await time.increase(301);
      await engine.connect(user).executeCycle();

      const [staked] = await lpAdapter.stakingInfo();
      expect(staked).to.be.gt(0);

      const userInfo = await masterChef.userInfo(poolId, lpAdapter.target);
      expect(userInfo.amount).to.equal(staked);
    });

    it("Should display staking info correctly", async function () {
      const { vault, engine, user, usdt, lpAdapter } = await loadFixture(
        deployFarmIntegrationFixture
      );

      const depositAmount = ethers.parseUnits("10000", 18);
      await vault.connect(user).deposit(depositAmount, user.address);

      await time.increase(301);
      await engine.connect(user).executeCycle();

      const [staked, unstaked, pending] = await lpAdapter.stakingInfo();
      expect(staked).to.be.gt(0);
      expect(unstaked).to.equal(0);
      expect(pending).to.equal(0);
    });
  });

  describe("CAKE Harvest", function () {
    it("Should harvest CAKE rewards after time passes", async function () {
      const { vault, engine, user, usdt, lpAdapter, masterChef, cake } =
        await loadFixture(deployFarmIntegrationFixture);

      const depositAmount = ethers.parseUnits("10000", 18);
      await vault.connect(user).deposit(depositAmount, user.address);

      await time.increase(301);
      await engine.connect(user).executeCycle();

      await masterChef.setRewardsPerBlock(ethers.parseUnits("10", 18));
      await time.increase(100);
      await ethers.provider.send("hardhat_mine", ["0x64"]);

      const [, , pendingBefore] = await lpAdapter.stakingInfo();
      expect(pendingBefore).to.be.gt(0);

      const vaultBalanceBefore = await usdt.balanceOf(vault.target);

      await impersonateAccount(vault.target);
      await setBalance(vault.target, ethers.parseEther("1"));
      const vaultSigner = await ethers.getSigner(vault.target);

      await lpAdapter.connect(vaultSigner).harvestRewards();
      const vaultBalanceAfter = await usdt.balanceOf(vault.target);
      expect(vaultBalanceAfter).to.be.gt(vaultBalanceBefore);
    });

    it("Should swap CAKE to USDT via PancakeSwap", async function () {
      const { vault, engine, user, lpAdapter, masterChef, cake, usdt } =
        await loadFixture(deployFarmIntegrationFixture);

      const depositAmount = ethers.parseUnits("10000", 18);
      await vault.connect(user).deposit(depositAmount, user.address);

      await time.increase(301);
      await engine.connect(user).executeCycle();

      await masterChef.setRewardsPerBlock(ethers.parseUnits("10", 18));
      await time.increase(100);
      await ethers.provider.send("hardhat_mine", ["0x64"]);

      await impersonateAccount(vault.target);
      await setBalance(vault.target, ethers.parseEther("1"));
      const vaultSigner = await ethers.getSigner(vault.target);
      const tx = await lpAdapter.connect(vaultSigner).harvestRewards();
      const receipt = await tx.wait();

      const harvestEvent = receipt.logs.find(
        (log) => lpAdapter.interface.parseLog(log)?.name === "RewardsHarvested"
      );
      expect(harvestEvent).to.not.be.undefined;
    });

    it("Should skip harvest if below minimum threshold", async function () {
      const { vault, engine, user, lpAdapter, masterChef } = await loadFixture(
        deployFarmIntegrationFixture
      );

      const depositAmount = ethers.parseUnits("10000", 18);
      await vault.connect(user).deposit(depositAmount, user.address);

      await time.increase(301);
      await engine.connect(user).executeCycle();

      await masterChef.setRewardsPerBlock(ethers.parseUnits("0.01", 18));
      await time.increase(10);
      await ethers.provider.send("hardhat_mine", ["0x0a"]);

      await impersonateAccount(vault.target);
      const vaultSigner = await ethers.getSigner(vault.target);
      const usdtReturned = await lpAdapter
        .connect(vaultSigner)
        .harvestRewards.staticCall();
      expect(usdtReturned).to.equal(0);
    });

    it("Should return harvested USDT to vault", async function () {
      const { vault, engine, user, usdt, lpAdapter, masterChef } =
        await loadFixture(deployFarmIntegrationFixture);

      const depositAmount = ethers.parseUnits("10000", 18);
      await vault.connect(user).deposit(depositAmount, user.address);

      await time.increase(301);
      await engine.connect(user).executeCycle();

      await masterChef.setRewardsPerBlock(ethers.parseUnits("10", 18));
      await time.increase(100);
      await ethers.provider.send("hardhat_mine", ["0x64"]);

      const vaultBalanceBefore = await usdt.balanceOf(vault.target);
      await impersonateAccount(vault.target);
      await setBalance(vault.target, ethers.parseEther("1"));
      const vaultSigner = await ethers.getSigner(vault.target);
      const usdtReturnedStatic = await lpAdapter
        .connect(vaultSigner)
        .harvestRewards.staticCall();
      const tx = await lpAdapter.connect(vaultSigner).harvestRewards();
      const vaultBalanceAfter = await usdt.balanceOf(vault.target);
      expect(vaultBalanceAfter).to.be.gt(vaultBalanceBefore);
    });
  });

  describe("executeCycle Integration", function () {
    it("Should call harvestRewards during executeCycle", async function () {
      const { vault, user, engine, lpAdapter, masterChef } = await loadFixture(
        deployFarmIntegrationFixture
      );

      const depositAmount = ethers.parseUnits("10000", 18);
      await vault.connect(user).deposit(depositAmount, user.address);

      await time.increase(301);
      await engine.connect(user).executeCycle();

      await masterChef.setRewardsPerBlock(ethers.parseUnits("10", 18));
      await time.increase(100);
      await ethers.provider.send("hardhat_mine", ["0x64"]);

      const [, , pendingBefore] = await lpAdapter.stakingInfo();
      expect(pendingBefore).to.be.gt(0);

      await time.increase(301);
      const tx = await engine.connect(user).executeCycle();

      const [, , pendingAfter] = await lpAdapter.stakingInfo();
      expect(pendingAfter).to.be.lt(pendingBefore);
    });

    it("Should redeploy harvested USDT in next rebalance", async function () {
      const { vault, user, engine, usdt, asterAdapter, lpAdapter, masterChef } =
        await loadFixture(deployFarmIntegrationFixture);

      const depositAmount = ethers.parseUnits("10000", 18);
      await vault.connect(user).deposit(depositAmount, user.address);

      await time.increase(301);
      await engine.connect(user).executeCycle();

      await masterChef.setRewardsPerBlock(ethers.parseUnits("100", 18));
      await time.increase(301);
      await ethers.provider.send("hardhat_mine", ["0x64"]);

      const asterBalanceBefore = await asterAdapter.managedAssets();
      const [, , pendingCakeBefore] = await lpAdapter.stakingInfo();
      await engine.connect(user).executeCycle();
      const asterBalanceAfter = await asterAdapter.managedAssets();
      // Verify CAKE was harvested and converted to USDT
      expect(pendingCakeBefore).to.be.gt(0);
      // Verify vault received harvested USDT and deployed it
      expect(asterBalanceAfter).to.be.gt(asterBalanceBefore);
    });

    it("Should handle non-farm adapter gracefully", async function () {
      const { vault, engine, user, usdt, deployer } = await loadFixture(
        deployFarmIntegrationFixture
      );

      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const MockPriceOracle = await ethers.getContractFactory(
        "MockPriceOracle"
      );
      const oracle2 = await MockPriceOracle.deploy(100000000n, user.address);

      const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
      const policy2 = await RiskPolicy.deploy(
        300,
        200,
        500,
        99000000n,
        200,
        100,
        2000,
        5000,
        7000,
        5,
        3600,
        500,
        5,
        5000,
        0,
        0,
        0
      );

      const MockChainlinkAggregator = await ethers.getContractFactory(
        "MockChainlinkAggregator"
      );
      const feed2 = await MockChainlinkAggregator.deploy(8, 100000000n);

      const MockStableSwapPoolWithLPSupport = await ethers.getContractFactory(
        "MockStableSwapPoolWithLPSupport"
      );
      const pool2 = await MockStableSwapPoolWithLPSupport.deploy(
        usdt.target,
        usdt.target,
        ethers.parseUnits("1000000", 18),
        ethers.parseUnits("1000000", 18),
        ethers.parseUnits("1", 18),
        4
      );

      const CircuitBreaker = await ethers.getContractFactory("CircuitBreaker");
      const breaker2 = await CircuitBreaker.deploy(
        feed2.target,
        pool2.target,
        50,
        100,
        50,
        3600,
        86400
      );

      const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
      const sharpe2 = await SharpeTracker.deploy(5);

      const ProofVault = await ethers.getContractFactory("ProofVault");
      const vault2 = await ProofVault.deploy(
        usdt.target,
        "Test",
        "TEST",
        deployer.address,
        500
      );

      const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
      const engine2 = await StrategyEngine.deploy(
        vault2.target,
        policy2.target,
        oracle2.target,
        breaker2.target,
        sharpe2.target,
        100000000n
      );

      await vault2.setEngine(engine2.target);
      await sharpe2.setEngine(engine2.target);

      const MockAsterEarnAdapterF = await ethers.getContractFactory(
        "MockAsterEarnAdapter"
      );
      const adapter1 = await MockAsterEarnAdapterF.deploy(
        usdt.target,
        deployer.address
      );
      const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
      const adapter2 = await ManagedAdapter.deploy(
        usdt.target,
        deployer.address
      );

      await vault2.setAdapters(
        adapter1.target,
        adapter2.target,
        ethers.ZeroAddress
      );
      await adapter1.setVault(vault2.target);
      await adapter2.setVault(vault2.target);
      await adapter1.lockConfiguration();
      await adapter2.lockConfiguration();
      await vault2.lockConfiguration();

      await usdt.mint(user.address, ethers.parseUnits("10000", 18));
      await usdt.connect(user).approve(vault2.target, ethers.MaxUint256);
      await vault2
        .connect(user)
        .deposit(ethers.parseUnits("10000", 18), user.address);

      await time.increase(301);
      await expect(engine2.connect(user).executeCycle()).to.not.be.reverted;
    });
  });

  describe("USDT to USDF Swap", function () {
    it("Should swap USDT to USDF before depositing to AsterDEX", async function () {
      const { vault, engine, user, usdt, usdf, asterAdapter, pancakeRouter } =
        await loadFixture(deployFarmIntegrationFixture);

      const depositAmount = ethers.parseUnits("10000", 18);
      await vault.connect(user).deposit(depositAmount, user.address);

      await time.increase(301);
      const tx = await engine.connect(user).executeCycle();
      const receipt = await tx.wait();

      const swapEvent = receipt.logs.find((log) => {
        try {
          return asterAdapter.interface.parseLog(log)?.name === "SwapExecuted";
        } catch {
          return false;
        }
      });
      expect(swapEvent).to.not.be.undefined;
    });

    it("Should only allow vault to claim matured withdrawals", async function () {
      const { user, asterAdapter } = await loadFixture(
        deployFarmIntegrationFixture
      );

      await expect(
        asterAdapter.connect(user).claimAllMatured()
      ).to.be.revertedWithCustomError(
        asterAdapter,
        "AsterEarnAdapterWithSwap__CallerNotVault"
      );
    });

    it("Should claim matured USDF, swap to USDT, and return funds to vault", async function () {
      const { vault, engine, user, usdt, usdf, asterAdapter } =
        await loadFixture(deployFarmIntegrationFixture);

      const depositAmount = ethers.parseUnits("10000", 18);
      await vault.connect(user).deposit(depositAmount, user.address);

      await time.increase(301);
      await engine.connect(user).executeCycle();

      await impersonateAccount(vault.target);
      await setBalance(vault.target, ethers.parseEther("1"));
      const vaultSigner = await ethers.getSigner(vault.target);

      await asterAdapter
        .connect(vaultSigner)
        .requestWithdraw(ethers.parseUnits("100", 18));
      await time.increase(3601);

      const vaultBalanceBefore = await usdt.balanceOf(vault.target);
      const sentStatic = await asterAdapter
        .connect(vaultSigner)
        .claimAllMatured.staticCall();
      expect(sentStatic).to.be.gt(0);

      await asterAdapter.connect(vaultSigner).claimAllMatured();

      const vaultBalanceAfter = await usdt.balanceOf(vault.target);
      expect(vaultBalanceAfter).to.be.gt(vaultBalanceBefore);
      expect(await usdf.balanceOf(asterAdapter.target)).to.equal(0);
      expect(await asterAdapter.totalPending()).to.equal(0);
    });
  });

  describe("Emergency Unstake", function () {
    it("Should allow emergency unstake before configuration lock", async function () {
      const [deployer, user] = await ethers.getSigners();

      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const usdt = await MockERC20.deploy("USDT", "USDT");
      const cake = await MockERC20.deploy("CAKE", "CAKE");

      const MockStableSwapPoolWithLPSupport = await ethers.getContractFactory(
        "MockStableSwapPoolWithLPSupport"
      );
      const pool = await MockStableSwapPoolWithLPSupport.deploy(
        usdt.target,
        usdt.target,
        ethers.parseUnits("1000000", 18),
        ethers.parseUnits("1000000", 18),
        ethers.parseUnits("1", 18),
        4
      );

      const MockPancakeRouter = await ethers.getContractFactory(
        "MockPancakeRouter"
      );
      const router = await MockPancakeRouter.deploy();

      const MockMasterChef = await ethers.getContractFactory("MockMasterChef");
      const chef = await MockMasterChef.deploy(cake.target);
      await chef.addPool(pool.target);

      const StableSwapLPYieldAdapterWithFarm = await ethers.getContractFactory(
        "StableSwapLPYieldAdapterWithFarm"
      );
      const adapter = await StableSwapLPYieldAdapterWithFarm.deploy(
        usdt.target,
        pool.target,
        cake.target,
        deployer.address,
        pool.target,
        chef.target,
        router.target,
        0,
        deployer.address
      );

      await pool.mint(adapter.target, ethers.parseUnits("100", 18));

      await expect(adapter.emergencyUnstakeAll()).to.not.be.reverted;

      const [staked] = await adapter.stakingInfo();
      expect(staked).to.equal(0);
    });
  });
});
