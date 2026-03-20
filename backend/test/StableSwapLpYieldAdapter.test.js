const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("StableSwapLPYieldAdapterWithFarm", function () {
  async function deployFixture() {
    const [deployer, vaultSigner, other] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdt = await MockERC20.deploy("USDT", "USDT");
    const wdks = await MockERC20.deploy("WDKS", "WDKS");
    const cake = await MockERC20.deploy("CAKE", "CAKE");

    // Deploy the LP-capable mock pool (self-mints LP tokens, pool IS the LP token ERC20)
    const MockPool = await ethers.getContractFactory(
      "MockStableSwapPoolWithLPSupport"
    );
    const pool = await MockPool.deploy(
      wdks.target,
      usdt.target,
      ethers.parseUnits("1000000", 18), // WDKS balance
      ethers.parseUnits("1000000", 18), // USDT balance
      ethers.parseUnits("1", 18), // virtualPrice = $1
      4 // 0.04% fee
    );

    // Fund pool with tokens so withdrawals work
    await usdt.mint(pool.target, ethers.parseUnits("2000000", 18));
    await wdks.mint(pool.target, ethers.parseUnits("2000000", 18));

    // Deploy MasterChef and PancakeRouter mocks
    const MockMasterChef = await ethers.getContractFactory("MockMasterChef");
    const masterChef = await MockMasterChef.deploy(cake.target);

    const MockPancakeRouter = await ethers.getContractFactory(
      "MockPancakeRouter"
    );
    const router = await MockPancakeRouter.deploy();

    // Register pool as LP pool in MasterChef (poolId = 0)
    await masterChef.addPool(pool.target);

    // Deploy adapter: pool serves as both lpToken and pool address
    const Adapter = await ethers.getContractFactory(
      "StableSwapLPYieldAdapterWithFarm"
    );
    const adapter = await Adapter.deploy(
      usdt.target,
      pool.target, // lpToken_ = pool (MockStableSwapPoolWithLPSupport is ERC20)
      cake.target,
      deployer.address, // nativeToken_ (mock placeholder for gas-gated harvest)
      pool.target, // pool_
      masterChef.target,
      router.target,
      0, // poolId_ = 0
      deployer.address
    );

    // Wire vault
    await adapter.setVault(vaultSigner.address);

    // Mint USDT to vault signer for deposits
    await usdt.mint(vaultSigner.address, ethers.parseUnits("100000", 18));
    await usdt.connect(vaultSigner).approve(adapter.target, ethers.MaxUint256);

    return {
      deployer,
      vaultSigner,
      other,
      usdt,
      wdks,
      cake,
      pool,
      masterChef,
      router,
      adapter,
    };
  }

  // ── Deployment ─────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("should set asset to USDT", async function () {
      const { adapter, usdt } = await loadFixture(deployFixture);
      expect(await adapter.asset()).to.equal(usdt.target);
    });

    it("should set vault correctly", async function () {
      const { adapter, vaultSigner } = await loadFixture(deployFixture);
      expect(await adapter.vault()).to.equal(vaultSigner.address);
    });

    it("should start with zero managedAssets", async function () {
      const { adapter } = await loadFixture(deployFixture);
      expect(await adapter.managedAssets()).to.equal(0n);
    });

    it("should revert setVault with zero address", async function () {
      const { adapter } = await loadFixture(deployFixture);
      await expect(
        adapter.setVault(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(adapter, "StableSwapLP__ZeroAddress");
    });

    it("should revert constructor with zero usdt", async function () {
      const { pool, cake, masterChef, router, deployer } = await loadFixture(
        deployFixture
      );
      const Adapter = await ethers.getContractFactory(
        "StableSwapLPYieldAdapterWithFarm"
      );
      await expect(
        Adapter.deploy(
          ethers.ZeroAddress,
          pool.target,
          cake.target,
          deployer.address, // nativeToken
          pool.target,
          masterChef.target,
          router.target,
          0,
          deployer.address
        )
      ).to.be.revertedWithCustomError(Adapter, "StableSwapLP__ZeroAddress");
    });

    it("should revert constructor with zero lpToken", async function () {
      const { usdt, pool, cake, masterChef, router, deployer } =
        await loadFixture(deployFixture);
      const Adapter = await ethers.getContractFactory(
        "StableSwapLPYieldAdapterWithFarm"
      );
      await expect(
        Adapter.deploy(
          usdt.target,
          ethers.ZeroAddress,
          cake.target,
          deployer.address, // nativeToken
          pool.target,
          masterChef.target,
          router.target,
          0,
          deployer.address
        )
      ).to.be.revertedWithCustomError(Adapter, "StableSwapLP__ZeroAddress");
    });

    it("should revert constructor with zero pool", async function () {
      const { usdt, pool, cake, masterChef, router, deployer } =
        await loadFixture(deployFixture);
      const Adapter = await ethers.getContractFactory(
        "StableSwapLPYieldAdapterWithFarm"
      );
      await expect(
        Adapter.deploy(
          usdt.target,
          pool.target,
          cake.target,
          deployer.address, // nativeToken
          ethers.ZeroAddress,
          masterChef.target,
          router.target,
          0,
          deployer.address
        )
      ).to.be.revertedWithCustomError(Adapter, "StableSwapLP__ZeroAddress");
    });
  });

  // ── onVaultDeposit ─────────────────────────────────────────────────────────

  describe("onVaultDeposit", function () {
    it("should stake LP tokens in MasterChef after deposit", async function () {
      const { adapter, vaultSigner, usdt, masterChef } = await loadFixture(
        deployFixture
      );
      const amount = ethers.parseUnits("1000", 18);

      // Vault transfers USDT to adapter first, then calls onVaultDeposit
      await usdt.connect(vaultSigner).transfer(adapter.target, amount);
      await adapter.connect(vaultSigner).onVaultDeposit(amount);

      // LP should be staked in MasterChef (not held by adapter)
      const [staked] = await masterChef.userInfo(0, adapter.target);
      expect(staked).to.be.gt(0n);
    });

    it("should increase managedAssets after deposit", async function () {
      const { adapter, vaultSigner, usdt } = await loadFixture(deployFixture);
      const amount = ethers.parseUnits("5000", 18);

      await usdt.connect(vaultSigner).transfer(adapter.target, amount);
      await adapter.connect(vaultSigner).onVaultDeposit(amount);

      const managed = await adapter.managedAssets();
      // managedAssets = staked LP * virtualPrice / 1e18 ≈ amount
      expect(managed).to.be.gt(0n);
    });

    it("should revert with zero amount", async function () {
      const { adapter, vaultSigner } = await loadFixture(deployFixture);
      await expect(
        adapter.connect(vaultSigner).onVaultDeposit(0)
      ).to.be.revertedWithCustomError(adapter, "StableSwapLP__ZeroAmount");
    });

    it("should revert if called by non-vault", async function () {
      const { adapter, other } = await loadFixture(deployFixture);
      await expect(
        adapter.connect(other).onVaultDeposit(1000n)
      ).to.be.revertedWithCustomError(adapter, "StableSwapLP__OnlyVault");
    });

    it("should emit LiquidityAdded event", async function () {
      const { adapter, vaultSigner, usdt } = await loadFixture(deployFixture);
      const amount = ethers.parseUnits("1000", 18);
      await usdt.connect(vaultSigner).transfer(adapter.target, amount);
      await expect(adapter.connect(vaultSigner).onVaultDeposit(amount)).to.emit(
        adapter,
        "LiquidityAdded"
      );
    });
  });

  // ── withdrawToVault ────────────────────────────────────────────────────────

  describe("withdrawToVault", function () {
    async function depositedFixture() {
      const ctx = await deployFixture();
      const { adapter, vaultSigner, usdt } = ctx;
      const amount = ethers.parseUnits("10000", 18);
      await usdt.connect(vaultSigner).transfer(adapter.target, amount);
      await adapter.connect(vaultSigner).onVaultDeposit(amount);
      return { ...ctx, depositedAmount: amount };
    }

    it("should unstake LP from MasterChef and return USDT to vault", async function () {
      const { adapter, vaultSigner, usdt } = await loadFixture(
        depositedFixture
      );
      const balBefore = await usdt.balanceOf(vaultSigner.address);
      await adapter
        .connect(vaultSigner)
        .withdrawToVault(ethers.parseUnits("1000", 18));
      const balAfter = await usdt.balanceOf(vaultSigner.address);
      expect(balAfter).to.be.gt(balBefore);
    });

    it("should return 0 when LP balance is empty", async function () {
      const { adapter, vaultSigner } = await loadFixture(deployFixture);
      const result = await adapter
        .connect(vaultSigner)
        .withdrawToVault.staticCall(ethers.parseUnits("1000", 18));
      expect(result).to.equal(0n);
    });

    it("should return 0 when amount is 0", async function () {
      const { adapter, vaultSigner } = await loadFixture(depositedFixture);
      const result = await adapter
        .connect(vaultSigner)
        .withdrawToVault.staticCall(0n);
      expect(result).to.equal(0n);
    });

    it("should cap LP burn at full balance when amount exceeds holdings", async function () {
      const { adapter, vaultSigner, usdt, masterChef } = await loadFixture(
        depositedFixture
      );
      const hugAmount = ethers.parseUnits("999999999", 18);
      const balBefore = await usdt.balanceOf(vaultSigner.address);
      await adapter.connect(vaultSigner).withdrawToVault(hugAmount);
      const balAfter = await usdt.balanceOf(vaultSigner.address);
      // All LP should be burned and returned to vault
      const [staked] = await masterChef.userInfo(0, adapter.target);
      expect(staked).to.equal(0n);
      expect(balAfter).to.be.gt(balBefore);
    });

    it("should revert if called by non-vault", async function () {
      const { adapter, other } = await loadFixture(depositedFixture);
      await expect(
        adapter.connect(other).withdrawToVault(ethers.parseUnits("100", 18))
      ).to.be.revertedWithCustomError(adapter, "StableSwapLP__OnlyVault");
    });

    it("should emit LiquidityRemoved event", async function () {
      const { adapter, vaultSigner } = await loadFixture(depositedFixture);
      await expect(
        adapter
          .connect(vaultSigner)
          .withdrawToVault(ethers.parseUnits("1000", 18))
      ).to.emit(adapter, "LiquidityRemoved");
    });
  });

  // ── managedAssets valuation ────────────────────────────────────────────────

  describe("managedAssets valuation", function () {
    it("should reflect virtual price appreciation", async function () {
      const { adapter, vaultSigner, usdt, pool } = await loadFixture(
        deployFixture
      );
      const amount = ethers.parseUnits("10000", 18);
      await usdt.connect(vaultSigner).transfer(adapter.target, amount);
      await adapter.connect(vaultSigner).onVaultDeposit(amount);

      const managedBefore = await adapter.managedAssets();

      // Simulate yield: virtual price increases 1%
      await pool.setVirtualPrice(ethers.parseUnits("1.01", 18));
      const managedAfter = await adapter.managedAssets();

      expect(managedAfter).to.be.gt(managedBefore);
    });

    it("should return 0 when no LP held", async function () {
      const { adapter } = await loadFixture(deployFixture);
      expect(await adapter.managedAssets()).to.equal(0n);
    });
  });

  // ── lockConfiguration ─────────────────────────────────────────────────────

  describe("lockConfiguration", function () {
    it("should lock and renounce ownership", async function () {
      const { adapter } = await loadFixture(deployFixture);
      await adapter.lockConfiguration();
      expect(await adapter.configurationLocked()).to.be.true;
      expect(await adapter.owner()).to.equal(ethers.ZeroAddress);
    });

    it("should revert lockConfiguration if vault not set", async function () {
      const { usdt, pool, cake, masterChef, router, deployer } =
        await loadFixture(deployFixture);
      const Adapter = await ethers.getContractFactory(
        "StableSwapLPYieldAdapterWithFarm"
      );
      const freshAdapter = await Adapter.deploy(
        usdt.target,
        pool.target,
        cake.target,
        deployer.address, // nativeToken
        pool.target,
        masterChef.target,
        router.target,
        0,
        deployer.address
      );
      await expect(
        freshAdapter.lockConfiguration()
      ).to.be.revertedWithCustomError(
        freshAdapter,
        "StableSwapLP__VaultNotSet"
      );
    });

    it("should revert double lock (owner renounced, so OwnableUnauthorizedAccount fires)", async function () {
      const { adapter, deployer } = await loadFixture(deployFixture);
      await adapter.lockConfiguration();
      // Owner is now ZeroAddress; onlyOwner fires before the custom error check
      await expect(adapter.lockConfiguration())
        .to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount")
        .withArgs(deployer.address);
    });

    it("should revert setVault after lock (owner renounced, so OwnableUnauthorizedAccount fires)", async function () {
      const { adapter, other, deployer } = await loadFixture(deployFixture);
      await adapter.lockConfiguration();
      // Owner is now ZeroAddress; onlyOwner fires before the custom error check
      await expect(adapter.setVault(other.address))
        .to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount")
        .withArgs(deployer.address);
    });

    it("should emit ConfigurationLocked event", async function () {
      const { adapter } = await loadFixture(deployFixture);
      await expect(adapter.lockConfiguration()).to.emit(
        adapter,
        "ConfigurationLocked"
      );
    });
  });

  // ── access control ─────────────────────────────────────────────────────────

  describe("Access control", function () {
    it("should revert setVault from non-owner", async function () {
      const { adapter, other } = await loadFixture(deployFixture);
      await expect(
        adapter.connect(other).setVault(other.address)
      ).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
    });

    it("should revert lockConfiguration from non-owner", async function () {
      const { adapter, other } = await loadFixture(deployFixture);
      await expect(
        adapter.connect(other).lockConfiguration()
      ).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
    });

    it("should emit VaultUpdated on setVault", async function () {
      const { usdt, pool, cake, masterChef, router, deployer, other } =
        await loadFixture(deployFixture);
      const Adapter = await ethers.getContractFactory(
        "StableSwapLPYieldAdapterWithFarm"
      );
      const freshAdapter = await Adapter.deploy(
        usdt.target,
        pool.target,
        cake.target,
        deployer.address, // nativeToken
        pool.target,
        masterChef.target,
        router.target,
        0,
        deployer.address
      );
      await expect(freshAdapter.setVault(other.address))
        .to.emit(freshAdapter, "VaultUpdated")
        .withArgs(other.address);
    });
  });
});
