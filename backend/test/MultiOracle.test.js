const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MultiOracleAggregator", function () {
  let aggregator, oracle1, oracle2, owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    const MockOracle = await ethers.getContractFactory("ChainlinkPriceOracle");
    const MockAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
    
    // Chainlink normalizes to 8 decimals in this contract
    const agg1 = await MockAggregator.deploy(8, 100000000n); // $1.00
    const agg2 = await MockAggregator.deploy(8, 101000000n); // $1.01
    
    oracle1 = await MockOracle.deploy(await agg1.getAddress(), 3600);
    oracle2 = await MockOracle.deploy(await agg2.getAddress(), 3600);

    const MultiOracle = await ethers.getContractFactory("MultiOracleAggregator");
    aggregator = await MultiOracle.deploy(
      [await oracle1.getAddress(), await oracle2.getAddress()],
      owner.address
    );
  });

  it("should return average price when within deviation", async function () {
    const price = await aggregator.getPrice();
    // Avg of 1.0 and 1.01 is 1.005
    // 1.005 in 8 decimals is 100500000
    expect(price).to.equal(100500000n);
  });

  it("should revert when deviation is too high", async function () {
    // 1.0 vs 1.05 (5% difference, max is 3%)
    const MockAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
    const agg3 = await MockAggregator.deploy(8, 105000000n);
    const oracle3 = await (await ethers.getContractFactory("ChainlinkPriceOracle")).deploy(
      await agg3.getAddress(), 
      3600
    );

    await aggregator.updateOracles([await oracle1.getAddress(), await oracle3.getAddress()]);
    
    await expect(aggregator.getPrice()).to.be.revertedWithCustomError(aggregator, "MultiOracle__DeviationTooHigh");
  });

  it("should handle lockConfiguration correctly", async function () {
    expect(await aggregator.locked()).to.be.false;
    
    await aggregator.lockConfiguration();
    expect(await aggregator.locked()).to.be.true;
    
    // Since lockConfiguration renounces ownership, updateOracles (onlyOwner) will revert with OwnableUnauthorizedAccount
    // The exact error name depends on OpenZeppelin version, in 5.x it is OwnableUnauthorizedAccount(address)
    await expect(aggregator.updateOracles([await oracle1.getAddress(), await oracle2.getAddress()]))
      .to.be.revertedWithCustomError(aggregator, "OwnableUnauthorizedAccount");
  });

  it("should revert when an underlying oracle is stale", async function () {
    // Move time forward past 3600s to expire heartbeat
    await ethers.provider.send("evm_increaseTime", [4000]);
    await ethers.provider.send("evm_mine");
    
    // ChainlinkPriceOracle.getPrice() will revert with ChainlinkPriceOracle__StalePrice
    await expect(aggregator.getPrice()).to.be.reverted;
  });
});
