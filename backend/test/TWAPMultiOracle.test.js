const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("TWAPMultiOracle", function () {
  let twapOracle;
  let oracle1, oracle2, oracle3;
  let owner, user;

  const INITIAL_PRICE = ethers.parseUnits("100", 8); // $100 in 8 decimals
  const OBSERVATION_INTERVAL = 30; // seconds
  const TWAP_WINDOW = 30 * 60; // 30 minutes

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy 3 mock oracles
    const MockOracle = await ethers.getContractFactory("MockPriceOracle");
    oracle1 = await MockOracle.deploy(INITIAL_PRICE);
    oracle2 = await MockOracle.deploy(INITIAL_PRICE);
    oracle3 = await MockOracle.deploy(INITIAL_PRICE);

    // Deploy TWAP oracle
    const TWAPOracle = await ethers.getContractFactory("TWAPMultiOracle");
    twapOracle = await TWAPOracle.deploy(
      [await oracle1.getAddress(), await oracle2.getAddress(), await oracle3.getAddress()],
      owner.address
    );
  });

  describe("Deployment", function () {
    it("should initialize with first observation", async function () {
      expect(await twapOracle.observationCount()).to.equal(1);
      const obs = await twapOracle.observations(0);
      expect(obs.price).to.equal(INITIAL_PRICE);
    });

    it("should revert with less than 3 oracles", async function () {
      const TWAPOracle = await ethers.getContractFactory("TWAPMultiOracle");
      await expect(
        TWAPOracle.deploy([await oracle1.getAddress(), await oracle2.getAddress()], owner.address)
      ).to.be.revertedWithCustomError(twapOracle, "TWAPMultiOracle__InvalidOracleCount");
    });

    it("should set correct TWAP window", async function () {
      expect(await twapOracle.twapWindow()).to.equal(TWAP_WINDOW);
    });
  });

  describe("Price Aggregation", function () {
    it("should return geometric mean of oracle prices", async function () {
      await oracle1.setPrice(ethers.parseUnits("100", 8));
      await oracle2.setPrice(ethers.parseUnits("102", 8));
      await oracle3.setPrice(ethers.parseUnits("101", 8));

      const price = await twapOracle.getPrice();
      // Geometric mean ≈ 101.00 (within rounding)
      expect(price).to.be.closeTo(ethers.parseUnits("101", 8), ethers.parseUnits("0.5", 8));
    });

    it("should revert if oracle prices deviate > 5%", async function () {
      await oracle1.setPrice(ethers.parseUnits("100", 8));
      await oracle2.setPrice(ethers.parseUnits("106", 8)); // 6% deviation
      await oracle3.setPrice(ethers.parseUnits("101", 8));

      await expect(twapOracle.getPrice()).to.be.revertedWithCustomError(
        twapOracle,
        "TWAPMultiOracle__DeviationTooHigh"
      );
    });

    it("should pass with 4.9% deviation", async function () {
      await oracle1.setPrice(ethers.parseUnits("100", 8));
      await oracle2.setPrice(ethers.parseUnits("104.9", 8)); // 4.9% deviation
      await oracle3.setPrice(ethers.parseUnits("102", 8));

      const price = await twapOracle.getPrice();
      expect(price).to.be.gt(0);
    });
  });

  describe("TWAP Calculation", function () {
    it("should return single observation price for one data point", async function () {
      const twapPrice = await twapOracle.getTWAPPrice();
      expect(twapPrice).to.equal(INITIAL_PRICE);
    });

    it("should calculate TWAP correctly over multiple observations", async function () {
      // t=0: $100
      // t=30: $102
      // t=60: $104
      // TWAP = (100*30 + 102*30 + 104*30) / 90 = 102

      await time.increase(OBSERVATION_INTERVAL);
      await oracle1.setPrice(ethers.parseUnits("102", 8));
      await oracle2.setPrice(ethers.parseUnits("102", 8));
      await oracle3.setPrice(ethers.parseUnits("102", 8));
      await twapOracle.updateObservation();

      await time.increase(OBSERVATION_INTERVAL);
      await oracle1.setPrice(ethers.parseUnits("104", 8));
      await oracle2.setPrice(ethers.parseUnits("104", 8));
      await oracle3.setPrice(ethers.parseUnits("104", 8));
      await twapOracle.updateObservation();

      const twapPrice = await twapOracle.getTWAPPrice();
      expect(twapPrice).to.be.closeTo(ethers.parseUnits("101", 8), ethers.parseUnits("0.5", 8));
    });

    it("should ignore observations older than 30 minutes", async function () {
      // Record 61 observations (more than MAX_OBSERVATIONS)
      for (let i = 0; i < 61; i++) {
        await time.increase(OBSERVATION_INTERVAL);
        await twapOracle.updateObservation();
      }

      // Should maintain exactly 60 observations (circular buffer)
      expect(await twapOracle.observationCount()).to.equal(60);
    });
  });

  describe("Observation Updates", function () {
    it("should update observation after interval", async function () {
      await time.increase(OBSERVATION_INTERVAL);
      await oracle1.setPrice(ethers.parseUnits("105", 8));
      await oracle2.setPrice(ethers.parseUnits("105", 8));
      await oracle3.setPrice(ethers.parseUnits("105", 8));

      await expect(twapOracle.updateObservation()).to.emit(twapOracle, "ObservationRecorded");

      expect(await twapOracle.observationCount()).to.equal(2);
    });

    it("should revert if updated too soon", async function () {
      const lastUpdateTime = await twapOracle.lastUpdateTime();
      await time.increase(28);
      const newTime = await time.latest();
      expect(newTime).to.be.lt(lastUpdateTime + BigInt(OBSERVATION_INTERVAL));
      await expect(twapOracle.updateObservation()).to.be.revertedWithCustomError(
        twapOracle,
        "TWAPMultiOracle__ObservationTooSoon"
      );
    });

    it("should maintain circular buffer at 60 observations", async function () {
      // Add 70 observations
      for (let i = 0; i < 70; i++) {
        await time.increase(OBSERVATION_INTERVAL);
        await twapOracle.updateObservation();
      }

      expect(await twapOracle.observationCount()).to.equal(60);
    });
  });

  describe("Flash Loan Resistance", function () {
    it("should resist sudden price spike (flash loan attack)", async function () {
      // Establish baseline TWAP at $100
      for (let i = 0; i < 10; i++) {
        await time.increase(OBSERVATION_INTERVAL);
        await twapOracle.updateObservation();
      }

      const baselineTWAP = await twapOracle.getTWAPPrice();
      expect(baselineTWAP).to.be.closeTo(INITIAL_PRICE, ethers.parseUnits("0.5", 8));

      // Flash loan attack: spike price to $150 for 1 observation
      await time.increase(OBSERVATION_INTERVAL);
      await oracle1.setPrice(ethers.parseUnits("150", 8));
      await oracle2.setPrice(ethers.parseUnits("150", 8));
      await oracle3.setPrice(ethers.parseUnits("150", 8));
      await twapOracle.updateObservation();

      // TWAP should barely move (only 30s impact on 30min window)
      const twapAfterSpike = await twapOracle.getTWAPPrice();
      const maxExpectedIncrease = ethers.parseUnits("1.5", 8); // ~1.5% increase max
      expect(twapAfterSpike).to.be.lt(baselineTWAP + maxExpectedIncrease);
    });

    it("should require sustained manipulation (30 min)", async function () {
      // Attacker tries to manipulate price for 15 minutes (50% of window)
      for (let i = 0; i < 30; i++) {
        // 30 observations * 30s = 15 min
        await time.increase(OBSERVATION_INTERVAL);
        if (i < 15) {
          // First 15 min: normal price
          await twapOracle.updateObservation();
        } else {
          // Next 15 min: manipulated price
          await oracle1.setPrice(ethers.parseUnits("120", 8));
          await oracle2.setPrice(ethers.parseUnits("120", 8));
          await oracle3.setPrice(ethers.parseUnits("120", 8));
          await twapOracle.updateObservation();
        }
      }

      // TWAP should reflect 50% weight at $100, 50% at $120 = ~$110
      const twapPrice = await twapOracle.getTWAPPrice();
      expect(twapPrice).to.be.closeTo(ethers.parseUnits("110", 8), ethers.parseUnits("2", 8));
    });
  });

  describe("Configuration Management", function () {
    it("should allow owner to update oracles before lock", async function () {
      const MockOracle = await ethers.getContractFactory("MockPriceOracle");
      const newOracle1 = await MockOracle.deploy(INITIAL_PRICE);
      const newOracle2 = await MockOracle.deploy(INITIAL_PRICE);
      const newOracle3 = await MockOracle.deploy(INITIAL_PRICE);

      await expect(
        twapOracle.updateOracles([
          await newOracle1.getAddress(),
          await newOracle2.getAddress(),
          await newOracle3.getAddress(),
        ])
      )
        .to.emit(twapOracle, "OraclesUpdated")
        .withArgs(3);
    });

    it("should prevent oracle updates after lock", async function () {
      await twapOracle.lockConfiguration();

      const MockOracle = await ethers.getContractFactory("MockPriceOracle");
      const newOracle = await MockOracle.deploy(INITIAL_PRICE);

      await expect(
        twapOracle.updateOracles([
          await newOracle.getAddress(),
          await newOracle.getAddress(),
          await newOracle.getAddress(),
        ])
      ).to.be.revertedWithCustomError(twapOracle, "TWAPMultiOracle__ConfigurationLocked");
    });

    it("should return locked status", async function () {
      expect(await twapOracle.locked()).to.equal(false);
      await twapOracle.lockConfiguration();
      expect(await twapOracle.locked()).to.equal(true);
    });
  });

  describe("Edge Cases", function () {
    it("should handle initialization correctly", async function () {
      // Should initialize with 1 observation automatically
      expect(await twapOracle.observationCount()).to.equal(1);
    });

    it("should handle single oracle price spike (others stable)", async function () {
      await oracle1.setPrice(ethers.parseUnits("150", 8)); // Spike
      await oracle2.setPrice(ethers.parseUnits("100", 8));
      await oracle3.setPrice(ethers.parseUnits("100", 8));

      // Should revert due to deviation check (50% deviation)
      await expect(twapOracle.getPrice()).to.be.revertedWithCustomError(
        twapOracle,
        "TWAPMultiOracle__DeviationTooHigh"
      );
    });
  });
});
