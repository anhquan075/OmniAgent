const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LayerZeroBridgeReceiver", function () {
  async function deployFixture() {
    const [deployer, user, vault] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const asset = await MockERC20.deploy("Mock USDT", "USDT");
    await asset.waitForDeployment();

    const MockLZEndpoint = await ethers.getContractFactory("MockLZEndpoint");
    const lzEndpoint = await MockLZEndpoint.deploy();
    await lzEndpoint.waitForDeployment();

    const LayerZeroBridgeReceiver = await ethers.getContractFactory("LayerZeroBridgeReceiver");
    const adapter = await LayerZeroBridgeReceiver.deploy(
      await asset.getAddress(),
      await lzEndpoint.getAddress(),
      deployer.address
    );
    await adapter.waitForDeployment();

    await adapter.setVault(vault.address);

    return { deployer, user, vault, asset, lzEndpoint, adapter };
  }

  it("should bridge tokens via LayerZero", async function () {
    const { vault, asset, adapter, lzEndpoint } = await deployFixture();
    const amount = ethers.parseUnits("1000", 6);
    const dstEid = 101;
    const options = "0x";
    const fee = ethers.parseEther("0.01");

    await asset.mint(vault.address, amount);
    await asset.connect(vault).approve(await adapter.getAddress(), amount);
    
    await expect(adapter.connect(vault).bridge(dstEid, amount, options, { value: fee }))
      .to.emit(lzEndpoint, "MessageSent")
      .withArgs(dstEid, amount);
  });

  it("should return quote for bridging", async function () {
    const { adapter } = await deployFixture();
    const fee = await adapter.quote(101, 1000, "0x");
    expect(fee).to.equal(ethers.parseEther("0.01"));
  });

  it("should restrict calls to vault only", async function () {
    const { user, adapter } = await deployFixture();
    await expect(adapter.connect(user).bridge(101, 100, "0x"))
      .to.be.revertedWithCustomError(adapter, "LZAdapter__CallerNotVault");
  });
});
