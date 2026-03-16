const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ChainlinkPriceOracle", function () {
  it("returns normalized 8-decimal price and locked=true", async function () {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
    const agg = await Agg.deploy(18, ethers.parseUnits("1", 18));
    await agg.waitForDeployment();
    await (await agg.setRound(ethers.parseUnits("1.2345", 18), now)).wait();

    const Oracle = await ethers.getContractFactory("ChainlinkPriceOracle");
    const oracle = await Oracle.deploy(await agg.getAddress(), 7200);
    await oracle.waitForDeployment();

    expect(await oracle.locked()).to.equal(true);
    expect(await oracle.getPrice()).to.equal(123450000n);
  });

  it("reverts on stale price", async function () {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
    const agg = await Agg.deploy(8, ethers.parseUnits("1", 8));
    await agg.waitForDeployment();
    await (await agg.setRound(ethers.parseUnits("1", 8), now - 10_000)).wait();

    const Oracle = await ethers.getContractFactory("ChainlinkPriceOracle");
    const oracle = await Oracle.deploy(await agg.getAddress(), 3600);
    await oracle.waitForDeployment();

    await expect(oracle.getPrice()).to.be.revertedWithCustomError(
      oracle,
      "ChainlinkPriceOracle__StalePrice"
    );
  });

  it("reverts on invalid non-positive price", async function () {
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
});
