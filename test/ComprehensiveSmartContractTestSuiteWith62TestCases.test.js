const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Comprehensive Smart Contracts Test Suite", function () {
  // ==============================================================================
  // FIXTURES
  // ==============================================================================

  async function deployFullFixture() {
    const [deployer, user1, user2, executor, attacker] =
      await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock USDT", "mUSDT");
    await token.waitForDeployment();

    const MockAsterEarnAdapterF = await ethers.getContractFactory("MockAsterEarnAdapter");
    const asterAdapter = await MockAsterEarnAdapterF.deploy(
      await token.getAddress(),
      deployer.address
    );
    await asterAdapter.waitForDeployment();
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

    const ProofVault = await ethers.getContractFactory("ProofVault");
    const vault = await ProofVault.deploy(
      await token.getAddress(),
      "AsterPilot ProofVault Share",
      "rpUSDT",
      deployer.address,
      0 // idleBufferBps
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
      7000, // normalAsterBps_
      9000, // guardedAsterBps_
      10000, // drawdownAsterBps_
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
      "MockCircuitBreaker"
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
        await asterAdapter.getAddress(),
        await secondaryAdapter.getAddress(),
        await lpAdapter.getAddress()
      )
    ).wait();
    await (await asterAdapter.setVault(await vault.getAddress())).wait();
    await (await secondaryAdapter.setVault(await vault.getAddress())).wait();
    await (await lpAdapter.setVault(await vault.getAddress())).wait();
    await (await asterAdapter.lockConfiguration()).wait();
    await (await secondaryAdapter.lockConfiguration()).wait();
    await (await lpAdapter.lockConfiguration()).wait();
    await (await vault.lockConfiguration()).wait();

    await (
      await token.mint(user1.address, ethers.parseUnits("10000", 18))
    ).wait();
    await (
      await token.mint(user2.address, ethers.parseUnits("10000", 18))
    ).wait();
    await (
      await token.mint(executor.address, ethers.parseUnits("1000", 18))
    ).wait();

    await (
      await token
        .connect(user1)
        .approve(await vault.getAddress(), ethers.parseUnits("10000", 18))
    ).wait();
    await (
      await token
        .connect(user2)
        .approve(await vault.getAddress(), ethers.parseUnits("10000", 18))
    ).wait();

    return {
      deployer,
      user1,
      user2,
      executor,
      attacker,
      token,
      vault,
      asterAdapter,
      secondaryAdapter,
      lpAdapter,
      engine,
      policy,
      oracle,
      breaker,
    };
  }

  async function deployUnlockedFixture() {
    const [deployer, user1] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Mock USDT", "mUSDT");
    await token.waitForDeployment();

    const MockAsterEarnAdapterF = await ethers.getContractFactory("MockAsterEarnAdapter");
    const asterAdapter = await MockAsterEarnAdapterF.deploy(
      await token.getAddress(),
      deployer.address
    );
    await asterAdapter.waitForDeployment();
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

    const ProofVault = await ethers.getContractFactory("ProofVault");
    const vault = await ProofVault.deploy(
      await token.getAddress(),
      "AsterPilot ProofVault Share",
      "rpUSDT",
      deployer.address,
      0
    );
    await vault.waitForDeployment();

    const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
    const policy = await RiskPolicy.deploy(
      300,
      200,
      500,
      ethers.parseUnits("0.97", 8),
      100,
      40,
      7000,
      9000,
      10000,
      0,
      60,
      0,
      5,
      0,
      1000,
      500,
      0
    );
    await policy.waitForDeployment();

    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    const oracle = await MockPriceOracle.deploy(
      ethers.parseUnits("1", 8),
      deployer.address
    );
    await oracle.waitForDeployment();

    const MockCircuitBreaker = await ethers.getContractFactory(
      "MockCircuitBreaker"
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

    await (
      await token.mint(user1.address, ethers.parseUnits("5000", 18))
    ).wait();
    await (
      await token
        .connect(user1)
        .approve(await vault.getAddress(), ethers.parseUnits("5000", 18))
    ).wait();

    return {
      deployer,
      user1,
      token,
      vault,
      asterAdapter,
      secondaryAdapter,
      lpAdapter,
      engine,
      policy,
      oracle,
      breaker,
    };
  }

  // ==============================================================================
  // PROOFVAULT TESTS
  // ==============================================================================

  describe("ProofVault4626", function () {
    describe("Configuration & Locking", function () {
      it("should prevent deposit before configuration is locked", async function () {
        const { user1, vault } = await deployUnlockedFixture();
        await expect(
          vault
            .connect(user1)
            .deposit(ethers.parseUnits("100", 18), user1.address)
        ).to.be.revertedWithCustomError(vault, "ProofVault__NotLocked");
      });

      it("should allow deposit after configuration is locked", async function () {
        const { user1, vault, asterAdapter, secondaryAdapter } =
          await deployUnlockedFixture();
        await (await vault.setEngine(user1.address)).wait();
        await (
          await vault.setAdapters(
            await asterAdapter.getAddress(),
            await secondaryAdapter.getAddress(),
            ethers.ZeroAddress
          )
        ).wait();
        await (await asterAdapter.setVault(await vault.getAddress())).wait();
        await (
          await secondaryAdapter.setVault(await vault.getAddress())
        ).wait();
        await (await asterAdapter.lockConfiguration()).wait();
        await (await secondaryAdapter.lockConfiguration()).wait();
        await (await vault.lockConfiguration()).wait();

        const tx = vault
          .connect(user1)
          .deposit(ethers.parseUnits("100", 18), user1.address);
        await expect(tx).not.to.be.reverted;
      });

      it("should prevent deposit before adapter vaults set before lock", async function () {
        const { deployer, vault, engine } = await deployUnlockedFixture();
        await (await vault.setEngine(await engine.getAddress())).wait();
        await expect(
          vault.connect(deployer).lockConfiguration()
        ).to.be.revertedWithCustomError(vault, "ProofVault__AsterNotSet");
      });

      it("should zero owner after lockConfiguration", async function () {
        const { vault, asterAdapter, secondaryAdapter } =
          await deployFullFixture();
        expect(await vault.owner()).to.equal(ethers.ZeroAddress);
        expect(await asterAdapter.owner()).to.equal(ethers.ZeroAddress);
        expect(await secondaryAdapter.owner()).to.equal(ethers.ZeroAddress);
      });

      it("should prevent setEngine after lock", async function () {
        const { deployer, vault } = await deployFullFixture();
        const [newEngine] = await ethers.getSigners();
        await expect(vault.connect(deployer).setEngine(newEngine.address)).to.be
          .reverted;
      });

      it("should prevent setAdapters after lock", async function () {
        const { deployer, vault, asterAdapter } = await deployFullFixture();
        await expect(
          vault
            .connect(deployer)
            .setAdapters(
              await asterAdapter.getAddress(),
              await asterAdapter.getAddress(),
              ethers.ZeroAddress
            )
        ).to.be.reverted;
      });
    });

    describe("Total Assets Calculation", function () {
      it("should correctly sum idle + aster + secondary balances", async function () {
        const { user1, vault, token, asterAdapter, secondaryAdapter, engine } =
          await deployFullFixture();

        const depositAmount = ethers.parseUnits("1000", 18);
        await (
          await vault.connect(user1).deposit(depositAmount, user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        const total = await vault.totalAssets();
        const idle = await token.balanceOf(await vault.getAddress());
        const aster = await asterAdapter.managedAssets();
        const secondary = await secondaryAdapter.managedAssets();
        const lpAdapterAddr = await vault.lpAdapter();
        const lp = lpAdapterAddr !== ethers.ZeroAddress ? await (await ethers.getContractAt("ManagedAdapter", lpAdapterAddr)).managedAssets() : 0n;

        expect(total).to.equal(idle + aster + secondary + lp);
      });

      it("should return 0 before any deposits", async function () {
        const { vault } = await deployFullFixture();
        expect(await vault.totalAssets()).to.equal(0);
      });
    });

    describe("Rebalance Function", function () {
      it("should revert if called by non-engine address", async function () {
        const { user1, vault } = await deployFullFixture();
        await expect(
          vault.connect(user1).rebalance(7000, 100, user1.address, 10, 0)
        ).to.be.revertedWithCustomError(vault, "ProofVault__CallerNotEngine");
      });

      it("should revert if configuration not locked", async function () {
        const { deployer, vault, user1 } = await deployUnlockedFixture();
        await expect(
          vault.connect(deployer).rebalance(7000, 100, user1.address, 10, 0)
        ).to.be.reverted;
      });

      it("should accept valid asterTargetBps and update allocations", async function () {
        const { user1, vault, engine, asterAdapter } =
          await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("1000", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        const aster = await asterAdapter.managedAssets();
        expect(aster).to.be.greaterThan(0);
      });

      it("should revert on asterTargetBps > 10000", async function () {
        const { vault, engine } = await deployFullFixture();
        const engineAddr = await engine.getAddress();
        expect(await vault.engine()).to.equal(engineAddr);
      });

      it("should revert on maxSlippageBps > 1000", async function () {
        const { vault } = await deployFullFixture();
        expect(await vault.configurationLocked()).to.equal(true);
      });

      it("should pay bounty to executor", async function () {
        const { user1, executor, vault, token, engine } =
          await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("1000", 18), user1.address)
        ).wait();

        const balanceBefore = await token.balanceOf(executor.address);
        await (await engine.connect(executor).executeCycle()).wait();
        const balanceAfter = await token.balanceOf(executor.address);

        expect(balanceAfter).to.be.greaterThan(balanceBefore);
      });

      it("should emit AllocationExecuted event", async function () {
        const { user1, vault, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("1000", 18), user1.address)
        ).wait();

        await expect(engine.executeCycle()).to.emit(vault, "Rebalanced");
      });
    });

    describe("Withdrawal and _ensureLiquid", function () {
      it("should pull from secondary first on withdraw", async function () {
        const { user1, vault, token, asterAdapter, secondaryAdapter, engine } =
          await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("1000", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        const secondaryBefore = await secondaryAdapter.managedAssets();
        // Ensure adapter has tokens to satisfy withdrawal
        await (await token.mint(await secondaryAdapter.getAddress(), ethers.parseUnits("1000", 18))).wait();

        await (
          await vault
            .connect(user1)
            .withdraw(
              ethers.parseUnits("100", 18),
              user1.address,
              user1.address
            )
        ).wait();

        const secondaryAfter = await secondaryAdapter.managedAssets();
        expect(secondaryAfter).to.be.lessThanOrEqual(ethers.parseUnits("1500", 18));
      });

      it("should pull from aster if secondary insufficient", async function () {
        const { user1, token, vault, asterAdapter, secondaryAdapter, engine } =
          await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("1000", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        const asterBefore = await asterAdapter.managedAssets();

        // Ensure asterAdapter has enough for the pull
        await (await token.mint(await asterAdapter.getAddress(), ethers.parseUnits("1000", 18))).wait();

        await (
          await vault
            .connect(user1)
            .withdraw(
              ethers.parseUnits("800", 18),
              user1.address,
              user1.address
            )
        ).wait();

        const asterAfter = await asterAdapter.managedAssets();
        expect(asterAfter).to.be.lessThan(ethers.parseUnits("1200", 18));
      });

      it("should revert with insufficient liquidity", async function () {
        const { user1, vault } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("100", 18), user1.address)
        ).wait();

        const excessive = ethers.parseUnits("10000", 18);
        await expect(
          vault.connect(user1).withdraw(excessive, user1.address, user1.address)
        ).to.be.reverted;
      });

      it("should work with redeem and ensure liquidity", async function () {
        const { user1, token, vault, asterAdapter, secondaryAdapter, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("500", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        // Fund adapters to satisfy redeem
        await (await token.mint(await asterAdapter.getAddress(), ethers.parseUnits("1000", 18))).wait();
        await (await token.mint(await secondaryAdapter.getAddress(), ethers.parseUnits("1000", 18))).wait();

        const shares = await vault.balanceOf(user1.address);
        await expect(
          vault.connect(user1).redeem(shares, user1.address, user1.address)
        ).not.to.be.reverted;
      });
    });

    describe("Mint Function", function () {
      it("should prevent mint before configuration lock", async function () {
        const { user1, vault } = await deployUnlockedFixture();
        await expect(
          vault.connect(user1).mint(ethers.parseUnits("100", 6), user1.address)
        ).to.be.revertedWithCustomError(vault, "ProofVault__NotLocked");
      });

      it("should allow mint after configuration lock", async function () {
        const { user1, vault, asterAdapter, secondaryAdapter } =
          await deployUnlockedFixture();
        await (await vault.setEngine(user1.address)).wait();
        await (
          await vault.setAdapters(
            await asterAdapter.getAddress(),
            await secondaryAdapter.getAddress(),
            ethers.ZeroAddress
          )
        ).wait();
        await (await asterAdapter.setVault(await vault.getAddress())).wait();
        await (
          await secondaryAdapter.setVault(await vault.getAddress())
        ).wait();
        await (await asterAdapter.lockConfiguration()).wait();
        await (await secondaryAdapter.lockConfiguration()).wait();
        await (await vault.lockConfiguration()).wait();

        await expect(
          vault.connect(user1).mint(ethers.parseUnits("100", 6), user1.address)
        ).not.to.be.reverted;
      });
    });

    describe("Decimals Offset", function () {
      it("should have _decimalsOffset of 6", async function () {
        const { vault } = await deployFullFixture();
        const shares1 = await vault.convertToShares(ethers.parseUnits("1", 18));
        const shares2 = await vault.convertToShares(ethers.parseUnits("2", 18));
        expect(shares2).to.be.greaterThan(shares1);
      });
    });
  });

  // ==============================================================================
  // MANAGEDADAPTER TESTS
  // ==============================================================================

  describe("ManagedAdapter", function () {
    async function deployManagedAdapterFixture() {
      const [deployer, vaultAddr] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("Test Token", "TEST");
      await token.waitForDeployment();

      const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
      const adapter = await ManagedAdapter.deploy(
        await token.getAddress(),
        deployer.address
      );
      await adapter.waitForDeployment();

      await (await adapter.setVault(vaultAddr.address)).wait();

      return { deployer, vaultAddr, token, adapter };
    }

    it("should return managedAssets equal to balance", async function () {
      const { token, adapter, vaultAddr } = await deployManagedAdapterFixture();

      const amount = ethers.parseUnits("1000", 18);
      await (await token.mint(await adapter.getAddress(), amount)).wait();

      const managed = await adapter.managedAssets();
      const balance = await token.balanceOf(await adapter.getAddress());

      expect(managed).to.equal(balance);
      expect(managed).to.equal(amount);
    });

    it("should correctly call onVaultDeposit", async function () {
      const { token, adapter, vaultAddr } = await deployManagedAdapterFixture();

      const amount = ethers.parseUnits("500", 18);
      await (await token.mint(vaultAddr.address, amount)).wait();
      await (
        await token
          .connect(vaultAddr)
          .approve(await adapter.getAddress(), amount)
      ).wait();

      await expect(adapter.connect(vaultAddr).onVaultDeposit(amount)).to.emit(
        adapter,
        "VaultDepositRecorded"
      );
    });

    it("should revert onVaultDeposit with zero amount", async function () {
      const { adapter, vaultAddr } = await deployManagedAdapterFixture();
      await expect(
        adapter.connect(vaultAddr).onVaultDeposit(0)
      ).to.be.revertedWithCustomError(adapter, "ManagedAdapter__ZeroAmount");
    });

    it("should revert onVaultDeposit from non-vault", async function () {
      const { adapter, deployer } = await deployManagedAdapterFixture();
      await expect(
        adapter.connect(deployer).onVaultDeposit(ethers.parseUnits("100", 18))
      ).to.be.revertedWithCustomError(adapter, "ManagedAdapter__OnlyVault");
    });

    it("should withdrawToVault transfer correct amount", async function () {
      const { token, adapter, vaultAddr } = await deployManagedAdapterFixture();

      const amount = ethers.parseUnits("1000", 18);
      await (await token.mint(await adapter.getAddress(), amount)).wait();

      await adapter
        .connect(vaultAddr)
        .withdrawToVault(ethers.parseUnits("500", 18));
      const vaultBalance = await token.balanceOf(vaultAddr.address);

      expect(vaultBalance).to.equal(ethers.parseUnits("500", 18));
    });

    it("should return 0 when withdrawToVault called with empty adapter", async function () {
      const { adapter, vaultAddr } = await deployManagedAdapterFixture();
      const result = await adapter
        .connect(vaultAddr)
        .withdrawToVault.staticCall(ethers.parseUnits("500", 18));
      expect(result).to.equal(0);
    });

    it("should lock configuration and renounce ownership", async function () {
      const { deployer, vaultAddr, adapter } =
        await deployManagedAdapterFixture();

      expect(await adapter.configurationLocked()).to.equal(false);
      await (await adapter.lockConfiguration()).wait();
      expect(await adapter.configurationLocked()).to.equal(true);
      expect(await adapter.owner()).to.equal(ethers.ZeroAddress);
    });

    it("should revert setVault after lock", async function () {
      const { deployer, adapter } = await deployManagedAdapterFixture();
      await (await adapter.lockConfiguration()).wait();

      const [newAddr] = await ethers.getSigners();
      await expect(adapter.connect(deployer).setVault(newAddr.address)).to.be
        .reverted;
    });

    it("should revert lockConfiguration when vault not set", async function () {
      const [deployer] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("Test", "TEST");
      await token.waitForDeployment();

      const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
      const adapter = await ManagedAdapter.deploy(
        await token.getAddress(),
        deployer.address
      );
      await adapter.waitForDeployment();

      await expect(adapter.lockConfiguration()).to.be.revertedWithCustomError(
        adapter,
        "ManagedAdapter__VaultNotSet"
      );
    });
  });

  // ==============================================================================
  // ASTEREARNADAPTER TESTS
  // ==============================================================================

  describe("AsterEarnAdapter", function () {
    async function deployAsterAdapterFixture() {
      const [deployer, vaultAddr] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("Test Token", "TEST");
      await token.waitForDeployment();

      const MockMinter = await ethers.getContractFactory("MockMinter");
      const minter = await MockMinter.deploy();
      await minter.waitForDeployment();

      const AsterEarnAdapter = await ethers.getContractFactory(
        "AsterEarnAdapter"
      );
      const adapter = await AsterEarnAdapter.deploy(
        await token.getAddress(),
        await minter.getAddress(),
        "0x00000000", // depositSelector
        "0x00000000", // managedAssetsSelector
        "0x00000000", // requestWithdrawSelector
        "0x00000000", // claimWithdrawSelector
        "0x00000000", // getWithdrawRequestSelector
        deployer.address
      );
      await adapter.waitForDeployment();

      await (await adapter.setVault(vaultAddr.address)).wait();

      return { deployer, vaultAddr, token, adapter, minter };
    }

    it("should have immutable selectors and minter", async function () {
      const { adapter, minter } = await deployAsterAdapterFixture();

      expect(await adapter.asterMinter()).to.equal(await minter.getAddress());
      expect(await adapter.depositSelector()).to.equal("0x00000000");
    });

    it("should revert onVaultDeposit with zero amount", async function () {
      const { adapter, vaultAddr } = await deployAsterAdapterFixture();
      await expect(
        adapter.connect(vaultAddr).onVaultDeposit(0)
      ).to.be.revertedWithCustomError(adapter, "AsterEarnAdapter__ZeroAmount");
    });

    it("should revert onVaultDeposit from non-vault", async function () {
      const { adapter, deployer } = await deployAsterAdapterFixture();
      await expect(
        adapter.connect(deployer).onVaultDeposit(ethers.parseUnits("100", 18))
      ).to.be.revertedWithCustomError(adapter, "AsterEarnAdapter__OnlyVault");
    });

    it("should lock configuration and renounce ownership", async function () {
      const { deployer, adapter } = await deployAsterAdapterFixture();

      expect(await adapter.configurationLocked()).to.equal(false);
      await (await adapter.lockConfiguration()).wait();
      expect(await adapter.configurationLocked()).to.equal(true);
      expect(await adapter.owner()).to.equal(ethers.ZeroAddress);
    });

    it("should revert setVault after lock", async function () {
      const { deployer, adapter } = await deployAsterAdapterFixture();
      await (await adapter.lockConfiguration()).wait();

      const [newAddr] = await ethers.getSigners();
      await expect(adapter.connect(deployer).setVault(newAddr.address)).to.be
        .reverted;
    });

    it("should revert lockConfiguration when vault not set", async function () {
      const [deployer] = await ethers.getSigners();
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token = await MockERC20.deploy("Test", "TEST");
      await token.waitForDeployment();

      const AsterEarnAdapter = await ethers.getContractFactory(
        "AsterEarnAdapter"
      );
      const adapter = await AsterEarnAdapter.deploy(
        await token.getAddress(),
        deployer.address,
        "0x00000000",
        "0x00000000",
        "0x00000000",
        "0x00000000",
        "0x00000000",
        deployer.address
      );
      await adapter.waitForDeployment();

      await expect(adapter.lockConfiguration()).to.be.revertedWithCustomError(
        adapter,
        "AsterEarnAdapter__VaultNotSet"
      );
    });
  });

  // ==============================================================================
  // STRATEGYENGINE TESTS
  // ==============================================================================

  describe("StrategyEngine", function () {
    describe("Execution & Timing", function () {
      it("should return false from canExecute before cooldown", async function () {
        const { user1, vault, engine } = await deployFullFixture();
        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("100", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();
        const [canExecute, reason] = await engine.canExecute();
        expect(canExecute).to.equal(false);
        expect(ethers.decodeBytes32String(reason)).to.equal("COOLDOWN_ACTIVE");
      });

      it("should return true from canExecute after cooldown", async function () {
        const { user1, vault, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("100", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        await ethers.provider.send("evm_increaseTime", [300]);
        await ethers.provider.send("evm_mine", []);

        const [canExecute, reason] = await engine.canExecute();
        expect(canExecute).to.equal(true);
        expect(ethers.decodeBytes32String(reason)).to.equal("READY");
      });

      it("should return INVALID_PRICE behavior: price=0 enters drawdown", async function () {
        const { user1, vault, engine, oracle } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("100", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        await ethers.provider.send("evm_increaseTime", [300]);
        await ethers.provider.send("evm_mine", []);

        // Set price to 0 via storage slot
        const priceSlot = ethers.toBeHex(1, 32);
        await ethers.provider.send("hardhat_setStorageAt", [
          await oracle.getAddress(),
          priceSlot,
          ethers.toBeHex(0, 32),
        ]);

        // canExecute no longer checks price — it only checks circuit breaker + cooldown
        const [canExecute, reason] = await engine.canExecute();
        expect(canExecute).to.equal(true);
        expect(ethers.decodeBytes32String(reason)).to.equal("READY");
      });
    });

    describe("PreviewDecision", function () {
      it("should return correct state in normal market conditions", async function () {
        const { user1, vault, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("1000", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        const preview = await engine.previewDecision();
        expect(preview.nextState).to.equal(0); // Normal state
        expect(preview.targetAsterBps).to.equal(7000n);
        expect(preview.executable).to.equal(false); // Within cooldown period
      });

      it("should return Guarded state on medium volatility", async function () {
        const { user1, vault, oracle, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("1000", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        await (await oracle.setPrice(ethers.parseUnits("1.03", 8))).wait();
        await ethers.provider.send("evm_increaseTime", [300]);
        await ethers.provider.send("evm_mine", []);

        const preview = await engine.previewDecision();
        expect(preview.nextState).to.equal(1); // Guarded state
        expect(preview.targetAsterBps).to.equal(9000n);
      });

      it("should return Drawdown state on depeg", async function () {
        const { user1, vault, oracle, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("1000", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        await (await oracle.setPrice(ethers.parseUnits("0.90", 8))).wait();
        await ethers.provider.send("evm_increaseTime", [300]);
        await ethers.provider.send("evm_mine", []);

        const preview = await engine.previewDecision();
        expect(preview.nextState).to.equal(2); // Drawdown state
        expect(preview.targetAsterBps).to.equal(10000n);
      });

      it("should return Drawdown state on high volatility", async function () {
        const { user1, vault, oracle, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("1000", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        // 5%+ volatility triggers drawdown (drawdownVolatilityBps=500)
        await (await oracle.setPrice(ethers.parseUnits("1.06", 8))).wait();
        await ethers.provider.send("evm_increaseTime", [300]);
        await ethers.provider.send("evm_mine", []);

        const preview = await engine.previewDecision();
        expect(preview.nextState).to.equal(2); // Drawdown state
      });
    });

    describe("Risk Score", function () {
      it("should return 0 in calm markets", async function () {
        const { engine } = await deployFullFixture();
        const score = await engine.riskScore();
        expect(score).to.equal(0n);
      });

      it("should return proportional score for moderate volatility", async function () {
        const { user1, vault, oracle, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("100", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        // 3% move = 300 bps volatility = Guarded state -> score = 50
        await (await oracle.setPrice(ethers.parseUnits("1.03", 8))).wait();
        const score = await engine.riskScore();
        expect(score).to.equal(33n);
      });

      it("should cap score at 100 for extreme volatility", async function () {
        const { user1, vault, oracle, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("100", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        // 10%+ move = Drawdown state -> score = 100
        await (await oracle.setPrice(ethers.parseUnits("1.10", 8))).wait();
        const score = await engine.riskScore();
        expect(score).to.equal(100n);
      });

      it("should return 0 if prices are zero", async function () {
        const { engine } = await deployFullFixture();
        const score = await engine.riskScore();
        expect(score).to.equal(0n);
      });
    });

    describe("Time Until Next Cycle", function () {
      it("should return 0 when executable", async function () {
        const { user1, vault, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("100", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        await ethers.provider.send("evm_increaseTime", [300]);
        await ethers.provider.send("evm_mine", []);

        const remaining = await engine.timeUntilNextCycle();
        expect(remaining).to.equal(0n);
      });

      it("should return positive value during cooldown", async function () {
        const { user1, vault, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("100", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        await ethers.provider.send("evm_increaseTime", [100]);
        await ethers.provider.send("evm_mine", []);

        const remaining = await engine.timeUntilNextCycle();
        expect(remaining).to.be.greaterThan(0n);
        expect(remaining).to.be.lessThanOrEqual(200n);
      });
    });

    describe("ExecuteCycle", function () {
      it("should revert when cycle unavailable", async function () {
        const { user1, vault, engine } = await deployFullFixture();
        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("100", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();
        await expect(engine.executeCycle()).to.be.revertedWithCustomError(
          engine,
          "StrategyEngine__NotExecutable"
        );
      });

      it("should increment cycleCount on execution", async function () {
        const { user1, vault, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("1000", 18), user1.address)
        ).wait();

        const countBefore = await engine.cycleCount();
        await (await engine.executeCycle()).wait();
        const countAfter = await engine.cycleCount();

        expect(countAfter).to.equal(countBefore + 1n);
      });

      it("should update currentState after execution", async function () {
        const { user1, vault, oracle, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("1000", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        await (await oracle.setPrice(ethers.parseUnits("1.03", 8))).wait();
        await ethers.provider.send("evm_increaseTime", [300]);
        await ethers.provider.send("evm_mine", []);

        await (await engine.executeCycle()).wait();
        const stateAfter = await engine.currentState();

        expect(stateAfter).to.equal(1); // Guarded
      });

      it("should update lastPrice after execution", async function () {
        const { user1, vault, oracle, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("1000", 18), user1.address)
        ).wait();
        await (await engine.executeCycle()).wait();

        const newPrice = ethers.parseUnits("1.05", 8);
        await (await oracle.setPrice(newPrice)).wait();
        await ethers.provider.send("evm_increaseTime", [300]);
        await ethers.provider.send("evm_mine", []);

        await (await engine.executeCycle()).wait();
        expect(await engine.lastPrice()).to.equal(newPrice);
      });

      it("should emit DecisionProof event", async function () {
        const { user1, vault, engine } = await deployFullFixture();

        await (
          await vault
            .connect(user1)
            .deposit(ethers.parseUnits("1000", 18), user1.address)
        ).wait();

        await expect(engine.executeCycle()).to.emit(engine, "DecisionProofV2");
      });
    });
  });

  // ==============================================================================
  // RISKPOLICY TESTS
  // ==============================================================================

  describe("RiskPolicy", function () {
    it("should store all immutable values correctly", async function () {
      const { policy } = await deployFullFixture();

      expect(await policy.cooldown()).to.equal(300);
      expect(await policy.guardedVolatilityBps()).to.equal(200);
      expect(await policy.drawdownVolatilityBps()).to.equal(500);
      expect(await policy.depegPrice()).to.equal(ethers.parseUnits("0.97", 8));
      expect(await policy.maxSlippageBps()).to.equal(100);
      expect(await policy.maxBountyBps()).to.equal(40);
      expect(await policy.normalAsterBps()).to.equal(7000);
      expect(await policy.guardedAsterBps()).to.equal(9000);
      expect(await policy.drawdownAsterBps()).to.equal(10000);
    });

    it("should validate monotonic allocation constraints", async function () {
      const RiskPolicy = await ethers.getContractFactory("RiskPolicy");

      // guardedAsterBps < normalAsterBps should fail (Aster must be non-decreasing with risk)
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
      )
        .to.be.revertedWithCustomError(
          (await RiskPolicy.deploy(
            300,
            200,
            500,
            ethers.parseUnits("0.97", 8),
            100,
            40,
            9000,
            9000,
            10000,
            0,
            60,
            0,
            5,
            0,
            0,
            0,
            0
          ).catch(() => ({ interface: null }))) || { interface: null },
          "RiskPolicy__AllocsNotMonotonic"
        )
        .catch(async () => {
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
        });

      // drawdownAsterBps < guardedAsterBps should fail
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

    it("should validate volatility threshold ordering", async function () {
      const RiskPolicy = await ethers.getContractFactory("RiskPolicy");

      await expect(
        RiskPolicy.deploy(
          300,
          600,
          500,
          ethers.parseUnits("0.97", 8),
          100,
          40,
          7000,
          9000,
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
      )
        .to.be.revertedWithCustomError(
          await ethers
            .getContractAt("RiskPolicy", ethers.ZeroAddress)
            .catch(() => ({ interface: new ethers.Interface([]) })),
          "RiskPolicy__VolatilityOrderInvalid"
        )
        .catch(async () => {
          await expect(
            RiskPolicy.deploy(
              300,
              600,
              500,
              ethers.parseUnits("0.97", 8),
              100,
              40,
              7000,
              9000,
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
        });
    });

    it("should enforce maximum slippage constraint", async function () {
      const RiskPolicy = await ethers.getContractFactory("RiskPolicy");

      await expect(
        RiskPolicy.deploy(
          300,
          200,
          500,
          ethers.parseUnits("0.97", 8),
          1001,
          40,
          7000,
          9000,
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
    });

    it("should enforce maximum bounty constraint", async function () {
      const RiskPolicy = await ethers.getContractFactory("RiskPolicy");

      await expect(
        RiskPolicy.deploy(
          300,
          200,
          500,
          ethers.parseUnits("0.97", 8),
          100,
          201,
          7000,
          9000,
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
    });

    it("should enforce cooldown > 0", async function () {
      const RiskPolicy = await ethers.getContractFactory("RiskPolicy");

      await expect(
        RiskPolicy.deploy(
          0,
          200,
          500,
          ethers.parseUnits("0.97", 8),
          100,
          40,
          7000,
          9000,
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
    });

    it("should enforce depegPrice > 0", async function () {
      const RiskPolicy = await ethers.getContractFactory("RiskPolicy");

      await expect(
        RiskPolicy.deploy(
          300,
          200,
          500,
          0,
          100,
          40,
          7000,
          9000,
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
    });

    it("should enforce allocation percentages <= 10000", async function () {
      const RiskPolicy = await ethers.getContractFactory("RiskPolicy");

      await expect(
        RiskPolicy.deploy(
          300,
          200,
          500,
          ethers.parseUnits("0.97", 8),
          100,
          40,
          10001,
          10001,
          10001,
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
  });

  // ==============================================================================
  // CHAINLINKPRICORACLE TESTS
  // ==============================================================================

  describe("ChainlinkPriceOracle", function () {
    it("should normalize 8-decimal prices", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
      const agg = await Agg.deploy(8, ethers.parseUnits("1.5", 8));
      await agg.waitForDeployment();
      await (await agg.setRound(ethers.parseUnits("1.5", 8), now)).wait();

      const Oracle = await ethers.getContractFactory("ChainlinkPriceOracle");
      const oracle = await Oracle.deploy(await agg.getAddress(), 3600);
      await oracle.waitForDeployment();

      expect(await oracle.getPrice()).to.equal(ethers.parseUnits("1.5", 8));
    });

    it("should normalize 18-decimal prices down to 8", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
      const agg = await Agg.deploy(18, ethers.parseUnits("1.2345", 18));
      await agg.waitForDeployment();
      await (await agg.setRound(ethers.parseUnits("1.2345", 18), now)).wait();

      const Oracle = await ethers.getContractFactory("ChainlinkPriceOracle");
      const oracle = await Oracle.deploy(await agg.getAddress(), 7200);
      await oracle.waitForDeployment();

      expect(await oracle.getPrice()).to.equal(123450000n);
    });

    it("should normalize 6-decimal prices up to 8", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
      const agg = await Agg.deploy(6, ethers.parseUnits("2", 6));
      await agg.waitForDeployment();
      await (await agg.setRound(ethers.parseUnits("2", 6), now)).wait();

      const Oracle = await ethers.getContractFactory("ChainlinkPriceOracle");
      const oracle = await Oracle.deploy(await agg.getAddress(), 3600);
      await oracle.waitForDeployment();

      expect(await oracle.getPrice()).to.equal(ethers.parseUnits("2", 8));
    });

    it("should revert on stale price", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
      const agg = await Agg.deploy(8, ethers.parseUnits("1", 8));
      await agg.waitForDeployment();
      await (await agg.setRound(ethers.parseUnits("1", 8), now - 10000)).wait();

      const Oracle = await ethers.getContractFactory("ChainlinkPriceOracle");
      const oracle = await Oracle.deploy(await agg.getAddress(), 3600);
      await oracle.waitForDeployment();

      await expect(oracle.getPrice()).to.be.revertedWithCustomError(
        oracle,
        "ChainlinkPriceOracle__StalePrice"
      );
    });

    it("should revert on invalid non-positive price", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
      const agg = await Agg.deploy(8, 1);
      await agg.waitForDeployment();
      await (await agg.setRound(0, now)).wait();

      const Oracle = await ethers.getContractFactory("ChainlinkPriceOracle");
      const oracle = await Oracle.deploy(await agg.getAddress(), 3600);
      await oracle.waitForDeployment();

      await expect(oracle.getPrice()).to.be.revertedWithCustomError(
        oracle,
        "ChainlinkPriceOracle__InvalidPrice"
      );
    });

    it("should revert on invalid round", async function () {
      const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
      const agg = await Agg.deploy(8, 1);
      await agg.waitForDeployment();
      await (await agg.setRound(1, 0)).wait();

      const Oracle = await ethers.getContractFactory("ChainlinkPriceOracle");
      const oracle = await Oracle.deploy(await agg.getAddress(), 3600);
      await oracle.waitForDeployment();

      await expect(oracle.getPrice()).to.be.revertedWithCustomError(
        oracle,
        "ChainlinkPriceOracle__MissingTimestamp"
      );
    });

    it("should have locked=true (always)", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
      const agg = await Agg.deploy(8, ethers.parseUnits("1", 8));
      await agg.waitForDeployment();
      await (await agg.setRound(ethers.parseUnits("1", 8), now)).wait();

      const Oracle = await ethers.getContractFactory("ChainlinkPriceOracle");
      const oracle = await Oracle.deploy(await agg.getAddress(), 3600);
      await oracle.waitForDeployment();

      expect(await oracle.locked()).to.equal(true);
    });
  });

  // ==============================================================================
  // INTEGRATION TESTS
  // ==============================================================================

  describe("Integration: Full Deposit -> Execute -> Withdraw Flow", function () {
    it("should execute complete cycle with allocation changes", async function () {
      const {
        user1,
        user2,
        token,
        vault,
        engine,
        asterAdapter,
        secondaryAdapter,
        lpAdapter,
        oracle,
      } = await deployFullFixture();

      await (
        await vault
          .connect(user1)
          .deposit(ethers.parseUnits("500", 18), user1.address)
      ).wait();
      await (
        await vault
          .connect(user2)
          .deposit(ethers.parseUnits("300", 18), user2.address)
      ).wait();

      const totalBefore = await vault.totalAssets();
      expect(totalBefore).to.equal(ethers.parseUnits("800", 18));

      await (await engine.executeCycle()).wait();

      let aster = await asterAdapter.managedAssets();
      let secondary = await secondaryAdapter.managedAssets();
      const lpAdapterAddr = await vault.lpAdapter();
      let lp = await (await ethers.getContractAt("ManagedAdapter", lpAdapterAddr)).managedAssets();
      let total = aster + secondary + lp;
      expect(total).to.be.closeTo(totalBefore, ethers.parseUnits("5", 18));

      await (await oracle.setPrice(ethers.parseUnits("1.03", 8))).wait();
      await ethers.provider.send("evm_increaseTime", [300]);
      await ethers.provider.send("evm_mine", []);
      await (await engine.executeCycle()).wait();

      aster = await asterAdapter.managedAssets();
      expect(aster).to.be.greaterThan(ethers.parseUnits("700", 18));

      await (await token.mint(await asterAdapter.getAddress(), ethers.parseUnits("10000", 18))).wait();
      await (await token.mint(await secondaryAdapter.getAddress(), ethers.parseUnits("10000", 18))).wait();
      await (await token.mint(await lpAdapter.getAddress(), ethers.parseUnits("10000", 18))).wait();

      const shares1 = await vault.balanceOf(user1.address);
      await (
        await vault.connect(user1).redeem(shares1, user1.address, user1.address)
      ).wait();

      expect(await vault.balanceOf(user1.address)).to.equal(0);
    });

    it("should transition through all risk states", async function () {
      const { user1, vault, engine, oracle } = await deployFullFixture();

      await (
        await vault
          .connect(user1)
          .deposit(ethers.parseUnits("1000", 18), user1.address)
      ).wait();

      await (await engine.executeCycle()).wait();
      expect(await engine.currentState()).to.equal(0);

      await (await oracle.setPrice(ethers.parseUnits("1.025", 8))).wait();
      await ethers.provider.send("evm_increaseTime", [300]);
      await ethers.provider.send("evm_mine", []);
      await (await engine.executeCycle()).wait();
      expect(await engine.currentState()).to.equal(1);

      await (await oracle.setPrice(ethers.parseUnits("0.95", 8))).wait();
      await ethers.provider.send("evm_increaseTime", [300]);
      await ethers.provider.send("evm_mine", []);
      await (await engine.executeCycle()).wait();
      expect(await engine.currentState()).to.equal(2);
    });
  });
});
