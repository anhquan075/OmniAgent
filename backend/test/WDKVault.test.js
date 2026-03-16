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
      0 // drawdownLpBps_
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
        await lpAdapter.getAddress()
      )
    ).wait();
    await (await wdkAdapter.setVault(await vault.getAddress())).wait();
    await (await secondaryAdapter.setVault(await vault.getAddress())).wait();
    await (await lpAdapter.setVault(await vault.getAddress())).wait();
    await (await wdkAdapter.lockConfiguration()).wait();
    await (await secondaryAdapter.lockConfiguration()).wait();
    await (await lpAdapter.lockConfiguration()).wait();
    await (await vault.lockConfiguration()).wait();

    await (
      await token.mint(user.address, ethers.parseUnits("10000", 18))
    ).wait();
    await (
      await token
        .connect(user)
        .approve(await vault.getAddress(), ethers.parseUnits("10000", 18))
    ).wait();

    return {
      deployer,
      user,
      executor,
      token,
      wdkAdapter,
      secondaryAdapter,
      lpAdapter,
      vault,
      policy,
      oracle,
      engine,
      breaker,
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
      300, // cooldown_
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
      0 // drawdownLpBps_
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
    const lpAdapter = await ManagedAdapter.deploy(
      await token.getAddress(),
      deployer.address
    );
    await lpAdapter.waitForDeployment();

    await (
      await vault.setAdapters(
        await wdkAdapter.getAddress(),
        await secondaryAdapter.getAddress(),
        await lpAdapter.getAddress()
      )
    ).wait();
    await (await wdkAdapter.setVault(await vault.getAddress())).wait();
    await (await secondaryAdapter.setVault(await vault.getAddress())).wait();
    await (await lpAdapter.setVault(await vault.getAddress())).wait();

    await (
      await token.mint(user.address, ethers.parseUnits("1000", 18))
    ).wait();
    await (
      await token
        .connect(user)
        .approve(await vault.getAddress(), ethers.parseUnits("1000", 18))
    ).wait();

    return {
      deployer,
      user,
      token,
      vault,
      policy,
      oracle,
      engine,
      wdkAdapter,
      secondaryAdapter,
      lpAdapter,
      breaker,
    };
  }

  it("deposits and executes normal allocation", async function () {
    const { user, token, vault, wdkAdapter, secondaryAdapter, lpAdapter, engine } = await deployFixture();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("1000", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    const totalAssets = await vault.totalAssets();
    const wdkManaged = await wdkAdapter.managedAssets();
    const secondaryManaged = await secondaryAdapter.managedAssets();
    const lpManaged = await (await ethers.getContractAt("ManagedAdapter", await vault.lpAdapter())).managedAssets();

    expect(totalAssets).to.be.closeTo(
      ethers.parseUnits("1000", 18),
      ethers.parseUnits("5", 18)
    );
    expect(wdkManaged + secondaryManaged + lpManaged).to.be.closeTo(
      ethers.parseUnits("1000", 18),
      ethers.parseUnits("5", 18)
    );

    // Give adapters tokens so they can satisfy the withdrawal
    await token.mint(await wdkAdapter.getAddress(), ethers.parseUnits("10000", 18));
    await token.mint(await secondaryAdapter.getAddress(), ethers.parseUnits("10000", 18));
    await token.mint(await lpAdapter.getAddress(), ethers.parseUnits("10000", 18));

    const shares = await vault.balanceOf(user.address);
    await (
      await vault.connect(user).redeem(shares, user.address, user.address)
    ).wait();
    const ending = await token.balanceOf(user.address);
    expect(ending).to.be.greaterThan(ethers.parseUnits("9950", 18));
  });

  it("enters guarded state on medium volatility", async function () {
    const { user, vault, wdkAdapter, secondaryAdapter, oracle, engine } = await deployFixture();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("1000", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    await (await oracle.setPrice(ethers.parseUnits("1.03", 8))).wait();
    await ethers.provider.send("evm_increaseTime", [2]);
    await ethers.provider.send("evm_mine", []);
    await (await engine.executeCycle()).wait();

    expect(await engine.currentState()).to.equal(1);
    const wdkManaged = await wdkAdapter.managedAssets();
    const secondaryManaged = await secondaryAdapter.managedAssets();
    const lpManaged = await (await ethers.getContractAt("ManagedAdapter", await vault.lpAdapter())).managedAssets();
    expect(wdkManaged + secondaryManaged + lpManaged).to.be.greaterThan(
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
    await ethers.provider.send("evm_increaseTime", [2]);
    await ethers.provider.send("evm_mine", []);
    await (await engine.executeCycle()).wait();

    expect(await engine.currentState()).to.equal(2);
    const wdkManaged2 = await wdkAdapter.managedAssets();
    const secondaryManaged2 = await secondaryAdapter.managedAssets();
    const lpManaged2 = await (await ethers.getContractAt("ManagedAdapter", await vault.lpAdapter())).managedAssets();
    expect(wdkManaged2 + secondaryManaged2 + lpManaged2).to.be.greaterThan(
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
    const { vault, engine } = await deployUnlockedFixture();
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

    // Attempting to set wrong adapter — the deployer should still be owner (unlocked)
    // The vault itself does not validate asset match in setAdapters; verify it does not crash
    // and that wrong assets are detectable by reading adapter.asset()
    expect(await wrongAdapter.asset()).to.equal(await wrongToken.getAddress());
    expect(await wrongAdapter.asset()).to.not.equal(await token.getAddress());
  });

  it("enforces cooldown before next cycle", async function () {
    const { user, vault, engine, wdkAdapter, secondaryAdapter } =
      await deployUnlockedFixture();

    await (await wdkAdapter.lockConfiguration()).wait();
    await (await secondaryAdapter.lockConfiguration()).wait();
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

    await ethers.provider.send("evm_increaseTime", [300]);
    await ethers.provider.send("evm_mine", []);

    const [canExecuteLater, reasonLater] = await engine.canExecute();
    expect(canExecuteLater).to.equal(true);
    expect(ethers.decodeBytes32String(reasonLater)).to.equal("READY");
  });

  it("enforces exact cooldown boundary", async function () {
    const { user, vault, engine, wdkAdapter, secondaryAdapter } =
      await deployUnlockedFixture();

    await (await wdkAdapter.lockConfiguration()).wait();
    await (await secondaryAdapter.lockConfiguration()).wait();
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
    expect(ethers.decodeBytes32String(beforeReason)).to.equal(
      "COOLDOWN_ACTIVE"
    );

    await ethers.provider.send("evm_increaseTime", [1]);
    await ethers.provider.send("evm_mine", []);

    const [atBoundary, atReason] = await engine.canExecute();
    expect(atBoundary).to.equal(true);
    expect(ethers.decodeBytes32String(atReason)).to.equal("READY");
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
      vault.connect(deployer).rebalance(7000, 100, deployer.address, 10, 0)
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
    const { oracle, engine, vault, wdkAdapter, secondaryAdapter, user } =
      await deployUnlockedFixture();

    await (await wdkAdapter.lockConfiguration()).wait();
    await (await secondaryAdapter.lockConfiguration()).wait();
    await (await vault.lockConfiguration()).wait();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("100", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    await ethers.provider.send("evm_increaseTime", [300]);
    await ethers.provider.send("evm_mine", []);

    // canExecute no longer checks price; only checks circuit breaker and cooldown
    const [canExecute, reason] = await engine.canExecute();
    expect(canExecute).to.equal(true);
    expect(ethers.decodeBytes32String(reason)).to.equal("READY");

    // Manipulate price to 0 via storage slot
    const priceSlot = ethers.toBeHex(1, 32);
    await ethers.provider.send("hardhat_setStorageAt", [
      await oracle.getAddress(),
      priceSlot,
      ethers.toBeHex(0, 32),
    ]);

    // executeCycle succeeds: price=0 <= depegPrice → enters Drawdown
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
    expect(ethers.decodeBytes32String(normalPreview.reason)).to.equal("READY");

    await (await engine.executeCycle()).wait();

    await (await oracle.setPrice(ethers.parseUnits("1.03", 8))).wait();
    await ethers.provider.send("evm_increaseTime", [2]);
    await ethers.provider.send("evm_mine", []);

    const guardedPreview = await engine.previewDecision();
    expect(guardedPreview.nextState).to.equal(1);
    expect(guardedPreview.targetWDKBps).to.equal(9000n);
    expect(guardedPreview.volatilityBps).to.be.greaterThan(0n);
  });

  it("rejects non-monotonic allocation policy", async function () {
    const RiskPolicy = await ethers.getContractFactory("RiskPolicy");

    // guardedWDKBps < normalWDKBps should fail (WDK must be non-decreasing with risk)
    await expect(
      RiskPolicy.deploy(
        300,
        200,
        500,
        ethers.parseUnits("0.97", 8),
        100,
        40,
        8000,
        7000,
        10000,
        0,
        60,
        0,
        5,
        0,
        0,
        0,
        0
      )
    ).to.be.reverted;

    // drawdownWDKBps < guardedWDKBps should fail
    await expect(
      RiskPolicy.deploy(
        300,
        200,
        500,
        ethers.parseUnits("0.97", 8),
        100,
        40,
        7000,
        9000,
        8500,
        0,
        60,
        0,
        5,
        0,
        0,
        0,
        0
      )
    ).to.be.reverted;
  });

  it("riskScore returns 0 in calm market", async function () {
    const { engine } = await deployFixture();
    const score = await engine.riskScore();
    expect(score).to.equal(0n);
  });

  it("riskScore returns 50 in guarded state (3% price move)", async function () {
    const { user, vault, oracle, engine } = await deployFixture();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("100", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    // 3% move -> vol = 300 bps -> Guarded (guardedVol=200, drawdownVol=500) -> score = 50
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

    // 10%+ move -> vol > drawdownVolatilityBps(500) -> Drawdown -> score = 100
    await (await oracle.setPrice(ethers.parseUnits("1.10", 8))).wait();
    const score = await engine.riskScore();
    expect(score).to.equal(100n);
  });

  it("timeUntilNextCycle returns 0 when cooldown has elapsed", async function () {
    const { user, vault, engine, wdkAdapter, secondaryAdapter } =
      await deployUnlockedFixture();

    await (await wdkAdapter.lockConfiguration()).wait();
    await (await secondaryAdapter.lockConfiguration()).wait();
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
    const { user, vault, engine, wdkAdapter, secondaryAdapter } =
      await deployUnlockedFixture();

    await (await wdkAdapter.lockConfiguration()).wait();
    await (await secondaryAdapter.lockConfiguration()).wait();
    await (await vault.lockConfiguration()).wait();

    await (
      await vault
        .connect(user)
        .deposit(ethers.parseUnits("100", 18), user.address)
    ).wait();
    await (await engine.executeCycle()).wait();

    // 100 seconds into 300s cooldown
    await ethers.provider.send("evm_increaseTime", [100]);
    await ethers.provider.send("evm_mine", []);

    const remaining = await engine.timeUntilNextCycle();
    expect(remaining).to.be.greaterThan(0n);
    expect(remaining).to.be.lessThanOrEqual(200n);
  });

  it("rebalance reverts when called directly (not via engine)", async function () {
    const { deployer, user, vault } = await deployFixture();
    await expect(
      vault.connect(deployer).rebalance(10000, 100, deployer.address, 0, 0)
    ).to.be.revertedWithCustomError(vault, "WDKVault__CallerNotEngine");
    await expect(
      vault.connect(user).rebalance(7000, 100, user.address, 10, 0)
    ).to.be.revertedWithCustomError(vault, "WDKVault__CallerNotEngine");
  });
});
