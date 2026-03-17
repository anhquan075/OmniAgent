const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OmniWDK WDKVault", function () {
  async function deployFixture() {
    const [deployer, user, executor] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock USDT", "mUSDT");
    await token.waitForDeployment();

    const MockWDKEarnAdapterF = await ethers.getContractFactory("MockWDKEarnAdapter");
    const wdkAdapter = await MockWDKEarnAdapterF.deploy(
      await token.getAddress(),
      deployer.address
    );
    await wdkAdapter.waitForDeployment();
    const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
    const secondaryAdapter = await ManagedAdapter.deploy(
      await token.getAddress(),
      deployer.address
    );
    await secondaryAdapter.waitForDeployment();

    const lpAdapter = await ManagedAdapter.deploy(
      await token.getAddress(),
      deployer.address
    );
    await lpAdapter.waitForDeployment();

    const MockLendingAdapter = await ethers.getContractFactory("MockLendingAdapter");
    const lendingAdapter = await MockLendingAdapter.deploy(
      await token.getAddress(),
      deployer.address
    );
    await lendingAdapter.waitForDeployment();

    const WDKVault = await ethers.getContractFactory("WDKVault");
    const vault = await WDKVault.deploy(
      await token.getAddress(),
      "OmniWDK WDKVault Share",
      "rpUSDT",
      deployer.address,
      0 // idleBufferBps = 0 for simple tests
    );
    await vault.waitForDeployment();

    const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
    const policy = await RiskPolicy.deploy(
      1, // cooldown_
      200, // guardedVolatilityBps_
      500, // drawdownVolatilityBps_
      ethers.parseUnits("0.97", 8), // depegPrice_
      100, // maxSlippageBps_
      40, // maxBountyBps_
      7000, // normalWDKBps_
      9000, // guardedWDKBps_
      10000, // drawdownWDKBps_
      0, // minBountyBps_
      60, // auctionDurationSeconds_
      0, // idleBufferBps_
      5, // sharpeWindowSize_
      0, // sharpeLowThreshold_
      1000, // normalLpBps_
      500, // guardedLpBps_
      0, // drawdownLpBps_
      1000, // maxAaveAllocationBps_
      ethers.parseUnits("1.2", 18) // minHealthFactor_
    );
    await policy.waitForDeployment();

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    const oracle = await MockPriceOracle.deploy(
      ethers.parseUnits("1", 8),
      deployer.address
    );
    await oracle.waitForDeployment();

    const MockCircuitBreaker = await ethers.getContractFactory(
      "MockCircuitBreakerAlwaysUnpaused"
    );
    const breaker = await MockCircuitBreaker.deploy();
    await breaker.waitForDeployment();

    const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
    const sharpeTracker = await SharpeTracker.deploy(5);
    await sharpeTracker.waitForDeployment();

    const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
    const engine = await StrategyEngine.deploy(
      await vault.getAddress(),
      await policy.getAddress(),
      await oracle.getAddress(),
      await breaker.getAddress(),
      await sharpeTracker.getAddress(),
      ethers.parseUnits("1", 8)
    );
    await engine.waitForDeployment();

    await (await sharpeTracker.setEngine(await engine.getAddress())).wait();

    await (await vault.setEngine(await engine.getAddress())).wait();
    await (
      await vault.setAdapters(
        await wdkAdapter.getAddress(),
        await secondaryAdapter.getAddress(),
        await lpAdapter.getAddress(),
        await lendingAdapter.getAddress()
      )
    ).wait();
    await (await wdkAdapter.setVault(await vault.getAddress())).wait();
    await (await secondaryAdapter.setVault(await vault.getAddress())).wait();
    await (await lpAdapter.setVault(await vault.getAddress())).wait();
    await (await lendingAdapter.setVault(await vault.getAddress())).wait();
    await (await wdkAdapter.lockConfiguration()).wait();
    await (await secondaryAdapter.lockConfiguration()).wait();
    await (await lpAdapter.lockConfiguration()).wait();
    await (await lendingAdapter.lockConfiguration()).wait();
    await (await vault.lockConfiguration()).wait();

    // Prepare user funds
    await token.mint(user.address, ethers.parseUnits("10000", 18));
    await token.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);

    return {
      deployer,
      user,
      token,
      vault,
      wdkAdapter,
      secondaryAdapter,
      lpAdapter,
      lendingAdapter,
      engine,
      policy,
      oracle,
      breaker,
      executor
    };
  }

  async function deployUnlockedFixture() {
    const [deployer, user] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock USDT", "mUSDT");
    await token.waitForDeployment();

    const MockWDKEarnAdapterF = await ethers.getContractFactory("MockWDKEarnAdapter");
    const wdkAdapter = await MockWDKEarnAdapterF.deploy(
      await token.getAddress(),
      deployer.address
    );
    await wdkAdapter.waitForDeployment();
    const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
    const secondaryAdapter = await ManagedAdapter.deploy(
      await token.getAddress(),
      deployer.address
    );
    await secondaryAdapter.waitForDeployment();

    const lpAdapter = await ManagedAdapter.deploy(
      await token.getAddress(),
      deployer.address
    );
    await lpAdapter.waitForDeployment();

    const MockLendingAdapter = await ethers.getContractFactory("MockLendingAdapter");
    const lendingAdapter = await MockLendingAdapter.deploy(
      await token.getAddress(),
      deployer.address
    );
    await lendingAdapter.waitForDeployment();

    const WDKVault = await ethers.getContractFactory("WDKVault");
    const vault = await WDKVault.deploy(
      await token.getAddress(),
      "OmniWDK WDKVault Share",
      "rpUSDT",
      deployer.address,
      0
    );
    await vault.waitForDeployment();

    const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
    const policy = await RiskPolicy.deploy(
      300, 200, 500, ethers.parseUnits("0.97", 8), 100, 40,
      7000, 9000, 10000, 0, 60, 0, 5, 0, 1000, 500, 0, 1000,
      ethers.parseUnits("1.2", 18)
    );
    await policy.waitForDeployment();

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    const oracle = await MockPriceOracle.deploy(ethers.parseUnits("1", 8), deployer.address);
    await oracle.waitForDeployment();

    const MockCircuitBreaker = await ethers.getContractFactory("MockCircuitBreakerAlwaysUnpaused");
    const breaker = await MockCircuitBreaker.deploy();
    await breaker.waitForDeployment();

    const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
    const sharpeTracker = await SharpeTracker.deploy(5);
    await sharpeTracker.waitForDeployment();

    const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
    const engine = await StrategyEngine.deploy(
      await vault.getAddress(),
      await policy.getAddress(),
      await oracle.getAddress(),
      await breaker.getAddress(),
      await sharpeTracker.getAddress(),
      ethers.parseUnits("1", 8)
    );
    await engine.waitForDeployment();

    await (await sharpeTracker.setEngine(await engine.getAddress())).wait();

    // Prepare user funds
    await token.mint(user.address, ethers.parseUnits("10000", 18));
    await token.connect(user).approve(await vault.getAddress(), ethers.MaxUint256);

    return {
      deployer,
      user,
      token,
      vault,
      wdkAdapter,
      secondaryAdapter,
      lpAdapter,
      lendingAdapter,
      engine,
      policy,
      oracle,
      breaker,
    };
  }

  it("deposits and executes normal allocation", async function () {
    const { user, vault, wdkAdapter, secondaryAdapter, engine } = await deployFixture();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("1000", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    const wdkManaged = await wdkAdapter.managedAssets();
    const secondaryManaged = await secondaryAdapter.managedAssets();
    const lpManaged = await (await ethers.getContractAt("ManagedAdapter", await vault.lpAdapter())).managedAssets();
    const lendingManaged = await (await ethers.getContractAt("ManagedAdapter", await vault.lendingAdapter())).managedAssets();

    expect(wdkManaged + secondaryManaged + lpManaged + lendingManaged).to.be.closeTo(
      ethers.parseUnits("1000", 18),
      ethers.parseUnits("5", 18)
    );
  });

  it("enters guarded state on medium volatility", async function () {
    const { user, vault, wdkAdapter, secondaryAdapter, oracle, engine } = await deployFixture();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("1000", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    await (await oracle.setPrice(ethers.parseUnits("1.04", 8))).wait();
    await ethers.provider.send("evm_increaseTime", [300]);
    await ethers.provider.send("evm_mine", []);
    await (await engine.executeCycle()).wait();

    expect(await engine.currentState()).to.equal(1);
    const wdkManaged = await wdkAdapter.managedAssets();
    const secondaryManaged = await secondaryAdapter.managedAssets();
    const lpManaged = await (await ethers.getContractAt("ManagedAdapter", await vault.lpAdapter())).managedAssets();
    const lendingManaged = await (await ethers.getContractAt("ManagedAdapter", await vault.lendingAdapter())).managedAssets();
    expect(wdkManaged + secondaryManaged + lpManaged + lendingManaged).to.be.greaterThan(
      ethers.parseUnits("850", 18)
    );
  });

  it("enters drawdown state on depeg", async function () {
    const { user, vault, wdkAdapter, secondaryAdapter, oracle, engine } =
      await deployFixture();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("1000", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    await (await oracle.setPrice(ethers.parseUnits("0.90", 8))).wait();
    await ethers.provider.send("evm_increaseTime", [300]);
    await ethers.provider.send("evm_mine", []);
    await (await engine.executeCycle()).wait();

    expect(await engine.currentState()).to.equal(2);
    const wdkManaged2 = await wdkAdapter.managedAssets();
    const secondaryManaged2 = await secondaryAdapter.managedAssets();
    const lpManaged2 = await (await ethers.getContractAt("ManagedAdapter", await vault.lpAdapter())).managedAssets();
    const lendingManaged2 = await (await ethers.getContractAt("ManagedAdapter", await vault.lendingAdapter())).managedAssets();
    expect(wdkManaged2 + secondaryManaged2 + lpManaged2 + lendingManaged2).to.be.greaterThan(
      ethers.parseUnits("980", 18)
    );
  });

  it("pays bounty to permissionless executor", async function () {
    const { user, executor, vault, token, engine } = await deployFixture();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("1000", 18), user.address)
    ).wait();

    const before = await token.balanceOf(executor.address);
    await (await engine.connect(executor).executeCycle()).wait();
    const after = await token.balanceOf(executor.address);

    expect(after).to.be.greaterThan(before);
  });

  it("disables owner controls after configuration lock", async function () {
    const { deployer, vault, wdkAdapter } = await deployFixture();

    expect(await vault.owner()).to.equal(ethers.ZeroAddress);
    expect(await wdkAdapter.owner()).to.equal(ethers.ZeroAddress);

    await expect(vault.connect(deployer).setEngine(deployer.address)).to.be
      .reverted;
  });

  it("blocks cycle execution when configuration is not locked", async function () {
    const { vault, engine, wdkAdapter, secondaryAdapter, lpAdapter, lendingAdapter } = await deployUnlockedFixture();
    await vault.setEngine(engine.target);
    await vault.setAdapters(wdkAdapter.target, secondaryAdapter.target, lpAdapter.target, lendingAdapter.target);
    // Not locked yet
    await expect(engine.executeCycle()).to.be.revertedWithCustomError(
      vault,
      "WDKVault__NotLocked"
    );
  });

  it("blocks deposit before configuration lock", async function () {
    const { user, vault } = await deployUnlockedFixture();

    await expect(
      vault.connect(user).deposit(ethers.parseUnits("100", 18), user.address)
    ).to.be.revertedWithCustomError(vault, "WDKVault__NotLocked");
  });

  it("rejects adapter configuration when asset mismatches", async function () {
    const { deployer, token, vault } = await deployUnlockedFixture();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const wrongToken = await MockERC20.deploy("Wrong Asset", "WAS");
    await wrongToken.waitForDeployment();

    const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
    const wrongAdapter = await ManagedAdapter.deploy(
      await wrongToken.getAddress(),
      deployer.address
    );
    await wrongAdapter.waitForDeployment();

    expect(await wrongAdapter.asset()).to.equal(await wrongToken.getAddress());
    expect(await wrongAdapter.asset()).to.not.equal(await token.getAddress());
  });

  it("enforces cooldown before next cycle", async function () {
    const { user, vault, engine, wdkAdapter, secondaryAdapter, lpAdapter, lendingAdapter } =
      await deployUnlockedFixture();

    await (await vault.setEngine(engine.target)).wait();
    await (await vault.setAdapters(wdkAdapter.getAddress(), secondaryAdapter.getAddress(), lpAdapter.getAddress(), lendingAdapter.getAddress())).wait();
    await (await wdkAdapter.setVault(vault.target)).wait();
    await (await secondaryAdapter.setVault(vault.target)).wait();
    await (await lpAdapter.setVault(vault.target)).wait();
    await (await lendingAdapter.setVault(vault.target)).wait();
    await (await wdkAdapter.lockConfiguration()).wait();
    await (await secondaryAdapter.lockConfiguration()).wait();
    await (await lpAdapter.lockConfiguration()).wait();
    await (await lendingAdapter.lockConfiguration()).wait();
    await (await vault.lockConfiguration()).wait();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("500", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    const [canExecuteNow, reasonNow] = await engine.canExecute();
    expect(canExecuteNow).to.equal(false);
    expect(ethers.decodeBytes32String(reasonNow)).to.equal("COOLDOWN_ACTIVE");
  });

  it("enforces exact cooldown boundary", async function () {
    const { user, vault, engine, wdkAdapter, secondaryAdapter, lpAdapter, lendingAdapter } =
      await deployUnlockedFixture();

    await (await vault.setEngine(engine.target)).wait();
    await (await vault.setAdapters(wdkAdapter.getAddress(), secondaryAdapter.getAddress(), lpAdapter.getAddress(), lendingAdapter.getAddress())).wait();
    await (await wdkAdapter.setVault(vault.target)).wait();
    await (await secondaryAdapter.setVault(vault.target)).wait();
    await (await lpAdapter.setVault(vault.target)).wait();
    await (await lendingAdapter.setVault(vault.target)).wait();
    await (await wdkAdapter.lockConfiguration()).wait();
    await (await secondaryAdapter.lockConfiguration()).wait();
    await (await lpAdapter.lockConfiguration()).wait();
    await (await lendingAdapter.lockConfiguration()).wait();
    await (await vault.lockConfiguration()).wait();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("500", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    await ethers.provider.send("evm_increaseTime", [299]);
    await ethers.provider.send("evm_mine", []);

    const [beforeBoundary, beforeReason] = await engine.canExecute();
    expect(beforeBoundary).to.equal(false);
    expect(ethers.decodeBytes32String(beforeReason)).to.equal("COOLDOWN_ACTIVE");
  });

  it("emits decision and allocation proof events on execution", async function () {
    const { user, vault, engine } = await deployFixture();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("1000", 18), user.address)
    ).wait();

    await expect(engine.executeCycle())
      .to.emit(engine, "DecisionProofV2")
      .and.to.emit(vault, "Rebalanced");
  });

  it("restricts rebalance to strategy engine only", async function () {
    const { deployer, vault } = await deployFixture();
    await expect(
      vault.connect(deployer).rebalance(7000, 1000, deployer.address, 10, 0)
    ).to.be.revertedWithCustomError(vault, "WDKVault__CallerNotEngine");
  });

  it("locks oracle and removes owner in deploy-like flow", async function () {
    const { deployer, oracle } = await deployUnlockedFixture();
    await (await oracle.lock()).wait();
    expect(await oracle.locked()).to.equal(true);
    expect(await oracle.owner()).to.equal(ethers.ZeroAddress);
    await expect(
      oracle.connect(deployer).setPrice(ethers.parseUnits("1.01", 8))
    ).to.be.reverted;
  });

  it("enters drawdown when oracle price is zero (price=0 <= depegPrice)", async function () {
    const { user, vault, engine, oracle, wdkAdapter, secondaryAdapter, lpAdapter, lendingAdapter } =
      await deployUnlockedFixture();

    await (await vault.setEngine(engine.target)).wait();
    await (await vault.setAdapters(wdkAdapter.getAddress(), secondaryAdapter.getAddress(), lpAdapter.getAddress(), lendingAdapter.getAddress())).wait();
    await (await wdkAdapter.setVault(vault.target)).wait();
    await (await secondaryAdapter.setVault(vault.target)).wait();
    await (await lpAdapter.setVault(vault.target)).wait();
    await (await lendingAdapter.setVault(vault.target)).wait();
    await (await wdkAdapter.lockConfiguration()).wait();
    await (await secondaryAdapter.lockConfiguration()).wait();
    await (await lpAdapter.lockConfiguration()).wait();
    await (await lendingAdapter.lockConfiguration()).wait();
    await (await vault.lockConfiguration()).wait();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("100", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    await ethers.provider.send("evm_increaseTime", [300]);
    await ethers.provider.send("evm_mine", []);

    const priceSlot = ethers.toBeHex(1, 32);
    await ethers.provider.send("hardhat_setStorageAt", [
      await oracle.getAddress(),
      priceSlot,
      ethers.toBeHex(0, 32),
    ]);

    await (await engine.executeCycle()).wait();
    expect(await engine.currentState()).to.equal(2); // Drawdown
  });

  it("exposes deterministic preview decision before execution", async function () {
    const { user, vault, oracle, engine } = await deployFixture();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("1000", 18), user.address)
    ).wait();

    const normalPreview = await engine.previewDecision();
    expect(normalPreview.executable).to.equal(true);
    expect(normalPreview.nextState).to.equal(0);
    expect(normalPreview.targetWDKBps).to.equal(7000n);

    await (await engine.executeCycle()).wait();

    await (await oracle.setPrice(ethers.parseUnits("1.04", 8))).wait();
    await ethers.provider.send("evm_increaseTime", [300]);
    await ethers.provider.send("evm_mine", []);

    const guardedPreview = await engine.previewDecision();
    expect(guardedPreview.nextState).to.equal(1);
    expect(guardedPreview.targetWDKBps).to.equal(9000n);
  });

  it("riskScore returns 50 in guarded state (3% price move)", async function () {
    const { user, vault, oracle, engine } = await deployFixture();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("100", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    await (await oracle.setPrice(ethers.parseUnits("1.03", 8))).wait();
    const score = await engine.riskScore();
    expect(score).to.equal(33n);
  });

  it("riskScore caps at 100 at extreme volatility (drawdown state)", async function () {
    const { user, vault, oracle, engine } = await deployFixture();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("100", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    await (await oracle.setPrice(ethers.parseUnits("1.10", 8))).wait();
    const score = await engine.riskScore();
    expect(score).to.equal(100n);
  });

  it("timeUntilNextCycle returns 0 when cooldown has elapsed", async function () {
    const { user, vault, engine, wdkAdapter, secondaryAdapter, lpAdapter, lendingAdapter } = await deployUnlockedFixture();

    await (await vault.setEngine(engine.target)).wait();
    await (await vault.setAdapters(wdkAdapter.getAddress(), secondaryAdapter.getAddress(), lpAdapter.getAddress(), lendingAdapter.getAddress())).wait();
    await (await wdkAdapter.setVault(vault.target)).wait();
    await (await secondaryAdapter.setVault(vault.target)).wait();
    await (await lpAdapter.setVault(vault.target)).wait();
    await (await lendingAdapter.setVault(vault.target)).wait();
    await (await wdkAdapter.lockConfiguration()).wait();
    await (await secondaryAdapter.lockConfiguration()).wait();
    await (await lpAdapter.lockConfiguration()).wait();
    await (await lendingAdapter.lockConfiguration()).wait();
    await (await vault.lockConfiguration()).wait();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("100", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    await ethers.provider.send("evm_increaseTime", [300]);
    await ethers.provider.send("evm_mine", []);

    const remaining = await engine.timeUntilNextCycle();
    expect(remaining).to.equal(0n);
  });

  it("timeUntilNextCycle returns positive value during active cooldown", async function () {
    const { user, vault, engine, wdkAdapter, secondaryAdapter, lpAdapter, lendingAdapter } = await deployUnlockedFixture();

    await (await vault.setEngine(engine.target)).wait();
    await (await vault.setAdapters(wdkAdapter.getAddress(), secondaryAdapter.getAddress(), lpAdapter.getAddress(), lendingAdapter.getAddress())).wait();
    await (await wdkAdapter.setVault(vault.target)).wait();
    await (await secondaryAdapter.setVault(vault.target)).wait();
    await (await lpAdapter.setVault(vault.target)).wait();
    await (await lendingAdapter.setVault(vault.target)).wait();
    await (await wdkAdapter.lockConfiguration()).wait();
    await (await secondaryAdapter.lockConfiguration()).wait();
    await (await lpAdapter.lockConfiguration()).wait();
    await (await lendingAdapter.lockConfiguration()).wait();
    await (await vault.lockConfiguration()).wait();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("100", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    await ethers.provider.send("evm_increaseTime", [100]);
    await ethers.provider.send("evm_mine", []);

    const remaining = await engine.timeUntilNextCycle();
    expect(remaining).to.be.greaterThan(0n);
  });
});
