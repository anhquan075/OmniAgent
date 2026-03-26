const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("WDKVault Adapter Resilience", function () {
  let vault;
  let token;
  let lpAdapter;
  let lendingAdapter;
  let owner;
  let engine;

  async function deployFixture() {
    [owner, engine] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    token = await MockERC20.deploy("Mock USDT", "mUSDT");
    await token.waitForDeployment();

    const OmniAgentVault = await ethers.getContractFactory("OmniAgentVault");
    vault = await OmniAgentVault.deploy(
      await token.getAddress(),
      "OmniAgent Vault Share",
      "rpUSDT",
      owner.address,
      0
    );
    await vault.waitForDeployment();

    const MockManagedAdapter = await ethers.getContractFactory("MockManagedAdapter");
    const wdkAdapter = await MockManagedAdapter.deploy(await token.getAddress(), await vault.getAddress());
    await wdkAdapter.waitForDeployment();

    const secondaryAdapter = await MockManagedAdapter.deploy(await token.getAddress(), await vault.getAddress());
    await secondaryAdapter.waitForDeployment();

    lpAdapter = await MockManagedAdapter.deploy(await token.getAddress(), await vault.getAddress());
    await lpAdapter.waitForDeployment();

    lendingAdapter = await MockManagedAdapter.deploy(await token.getAddress(), await vault.getAddress());
    await lendingAdapter.waitForDeployment();

    await vault.setEngine(engine.address);
    await vault.setAdapters(
      await wdkAdapter.getAddress(),
      await secondaryAdapter.getAddress(),
      await lpAdapter.getAddress(),
      await lendingAdapter.getAddress()
    );
    await vault.lockConfiguration();

    await token.mint(await vault.getAddress(), ethers.parseUnits("10000", 6));
  }

  beforeEach(async function () {
    await deployFixture();
  });

  describe("try-catch resilience", function () {
    it("should have AdapterCallFailed event defined", async function () {
      const event = vault.interface.getEvent("AdapterCallFailed");
      expect(event).to.not.be.undefined;
      expect(event.inputs.length).to.equal(3);
    });

    it("should succeed rebalance with healthy adapters", async function () {
      await expect(
        vault.connect(engine).rebalance(5000, 5000, owner.address, 0, 0)
      ).to.emit(vault, "Rebalanced");
    });
  });
});
