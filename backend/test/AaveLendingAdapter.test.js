const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AaveLendingAdapter", function () {
  async function deployFixture() {
    const [deployer, user, vault] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const asset = await MockERC20.deploy("Mock USDT", "USDT");
    await asset.waitForDeployment();

    const aToken = await MockERC20.deploy("Aave Mock aUSDT", "aUSDT");
    await aToken.waitForDeployment();

    const MockAavePool = await ethers.getContractFactory("MockAavePool");
    const pool = await MockAavePool.deploy(await asset.getAddress(), await aToken.getAddress());
    await pool.waitForDeployment();

    const AaveLendingAdapter = await ethers.getContractFactory("AaveLendingAdapter");
    const adapter = await AaveLendingAdapter.deploy(
      await asset.getAddress(),
      await aToken.getAddress(),
      await pool.getAddress(),
      deployer.address
    );
    await adapter.waitForDeployment();

    await adapter.setVault(vault.address);

    return { deployer, user, vault, asset, aToken, pool, adapter };
  }

  it("should supply assets to Aave", async function () {
    const { vault, asset, aToken, adapter, pool } = await deployFixture();
    const amount = ethers.parseUnits("1000", 6);

    await asset.mint(vault.address, amount);
    await asset.connect(vault).approve(await adapter.getAddress(), amount);
    
    await expect(adapter.connect(vault).onVaultDeposit(amount))
      .to.emit(asset, "Approval")
      .withArgs(await adapter.getAddress(), await pool.getAddress(), amount);

    expect(await aToken.balanceOf(adapter.getAddress())).to.equal(amount);
  });

  it("should withdraw assets from Aave", async function () {
    const { vault, asset, aToken, adapter, pool } = await deployFixture();
    const amount = ethers.parseUnits("1000", 6);

    // Setup: supply first
    await asset.mint(vault.address, amount);
    await asset.connect(vault).approve(await adapter.getAddress(), amount);
    await adapter.connect(vault).onVaultDeposit(amount);

    // Withdraw half
    const withdrawAmount = ethers.parseUnits("500", 6);
    await adapter.connect(vault).withdrawToVault(withdrawAmount);

    expect(await asset.balanceOf(vault.address)).to.equal(withdrawAmount);
    expect(await aToken.balanceOf(adapter.getAddress())).to.equal(withdrawAmount);
  });

  it("should report health factor", async function () {
    const { vault, asset, adapter } = await deployFixture();
    // Supply assets first so mock returns health factor > 0
    const amount = ethers.parseUnits("1000", 6);
    await asset.mint(vault.address, amount);
    await asset.connect(vault).approve(await adapter.getAddress(), amount);
    await adapter.connect(vault).onVaultDeposit(amount);
    
    const hf = await adapter.getHealthFactor();
    expect(hf).to.equal(ethers.parseUnits("2", 18)); // Mock returns 2e18 when deposits > 0
  });

  it("should restrict calls to vault only", async function () {
    const { user, adapter } = await deployFixture();
    await expect(adapter.connect(user).onVaultDeposit(100))
      .to.be.revertedWithCustomError(adapter, "AaveAdapter__CallerNotVault");
  });
});
