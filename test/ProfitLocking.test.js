const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("WDKVault Profit Locking", function () {
  let vault, asset, owner, user, engine, secondary, lp, wdk;
  let idleBufferBps = 500; // 5%
  let lpAdapter;

  beforeEach(async function () {
    [owner, user, engine, secondary, lp, wdk] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    asset = await MockERC20.deploy("Tether", "USDT");
    await asset.waitForDeployment();

    const WDKVault = await ethers.getContractFactory("WDKVault");
    vault = await WDKVault.deploy(
      await asset.getAddress(),
      "OmniWDK Vault",
      "oWDK",
      owner.address,
      idleBufferBps
    );
    await vault.waitForDeployment();

    await vault.setEngine(engine.address);
    
    // We need mock adapters that can "generate profit"
    const MockAdapter = await ethers.getContractFactory("MockWDKEarnAdapter");
    const wdkAdapter = await MockAdapter.deploy(await asset.getAddress(), owner.address);
    const secondaryAdapter = await MockAdapter.deploy(await asset.getAddress(), owner.address);
    lpAdapter = await MockAdapter.deploy(await asset.getAddress(), owner.address);
    
    await wdkAdapter.setVault(await vault.getAddress());
    await secondaryAdapter.setVault(await vault.getAddress());
    await lpAdapter.setVault(await vault.getAddress());
    
    await vault.setAdapters(
      await wdkAdapter.getAddress(),
      await secondaryAdapter.getAddress(),
      await lpAdapter.getAddress()
    );
    
    await vault.lockConfiguration();
    
    // Setup initial state: 1000 USDT deposit
    await asset.mint(user.address, ethers.parseUnits("1000", 18));
    await asset.connect(user).approve(await vault.getAddress(), ethers.parseUnits("1000", 18));
    await vault.connect(user).deposit(ethers.parseUnits("1000", 18), user.address);
  });

  it("should initialize with zero locked profit", async function () {
    expect(await vault.lockedProfit()).to.equal(0);
    expect(await vault.calculateLockedProfit()).to.equal(0);
  });

  it("should lock profit after a rebalance that triggers a harvest", async function () {
    await vault.connect(engine).rebalance(0, 0, ethers.ZeroAddress, 0, 0);
    
    const locked = await vault.lockedProfit();
    expect(locked).to.be.closeTo(ethers.parseUnits("100", 18), ethers.parseUnits("0.01", 18));
    
    const total = await vault.totalAssets();
    expect(total).to.be.closeTo(ethers.parseUnits("1000", 18), ethers.parseUnits("0.1", 18));
  });

  it("should unlock profit linearly over time", async function () {
    await vault.connect(engine).rebalance(0, 0, ethers.ZeroAddress, 0, 0);
    const initialLocked = await vault.calculateLockedProfit();
    
    await ethers.provider.send("evm_increaseTime", [3 * 3600]);
    await ethers.provider.send("evm_mine");
    
    const halfLocked = await vault.calculateLockedProfit();
    expect(halfLocked).to.be.closeTo(initialLocked / 2n, ethers.parseUnits("0.01", 18));
    
    const total = await vault.totalAssets();
    expect(total).to.be.closeTo(ethers.parseUnits("1050", 18), ethers.parseUnits("0.1", 18));
    
    await ethers.provider.send("evm_increaseTime", [4 * 3600]);
    await ethers.provider.send("evm_mine");
    
    expect(await vault.calculateLockedProfit()).to.equal(0);
    expect(await vault.totalAssets()).to.be.closeTo(ethers.parseUnits("1100", 18), ethers.parseUnits("0.1", 18));
  });

  it("should handle losses by reducing locked profit immediately", async function () {
    // 1. Generate 100 profit
    await vault.connect(engine).rebalance(0, 0, ethers.ZeroAddress, 0, 0);
    let locked = await vault.lockedProfit();
    expect(locked).to.be.closeTo(ethers.parseUnits("100", 18), ethers.parseUnits("0.01", 18));
    
    // 2. Prepare adapter with some funds so it can "lose" them
    // lpTarget is 0 in previous rebalance, so it has no funds.
    // Let's rebalance so it has funds first.
    // lpTargetBps = 5000 (50%)
    await vault.connect(engine).rebalance(0, 0, ethers.ZeroAddress, 0, 5000);
    
    const lpBalance = await asset.balanceOf(await lpAdapter.getAddress());
    expect(lpBalance).to.be.gt(0);

    // 3. Set next harvest to lose 40
    await lpAdapter.setNextHarvestResult(ethers.parseUnits("-40", 18));
    
    // 4. Trigger rebalance to recognize loss
    const preLocked = await vault.calculateLockedProfit();
    await vault.connect(engine).rebalance(0, 0, ethers.ZeroAddress, 0, 5000);
    
    const postLocked = await vault.lockedProfit();
    // preLocked (~100 or slightly less due to decay) - 40 = ~60
    expect(postLocked).to.be.closeTo(preLocked - ethers.parseUnits("40", 18), ethers.parseUnits("0.01", 18));
  });
});
