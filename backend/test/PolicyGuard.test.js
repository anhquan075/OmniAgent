const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PolicyGuard Security Fix", function () {
  let policyGuard;
  let owner;
  let authorizedCaller;
  let unauthorized;

  const MAX_SINGLE_TX = ethers.parseUnits("10000", 6);
  const DAILY_LIMIT = ethers.parseUnits("100000", 6);
  const MAX_PERCENTAGE_BPS = 5000;
  const COOLDOWN_SECONDS = 60;

  async function deployFixture() {
    [owner, authorizedCaller, unauthorized] = await ethers.getSigners();

    const PolicyGuard = await ethers.getContractFactory("PolicyGuard");
    policyGuard = await PolicyGuard.deploy(
      owner.address,
      authorizedCaller.address,
      MAX_SINGLE_TX,
      DAILY_LIMIT,
      MAX_PERCENTAGE_BPS,
      COOLDOWN_SECONDS
    );
    await policyGuard.waitForDeployment();

    await policyGuard.whitelistReceiver(authorizedCaller.address);
    await policyGuard.whitelistReceiver(unauthorized.address);
  }

  beforeEach(async function () {
    await deployFixture();
  });

  describe("onlyAuthorized modifier", function () {
    it("should allow operator to call commit()", async function () {
      const amount = ethers.parseUnits("100", 6);
      await expect(policyGuard.connect(owner).commit(amount))
        .to.emit(policyGuard, "PolicyCommitted");
    });

    it("should allow authorized caller to call commit()", async function () {
      const amount = ethers.parseUnits("100", 6);
      await expect(policyGuard.connect(authorizedCaller).commit(amount))
        .to.emit(policyGuard, "PolicyCommitted");
    });

    it("should revert when unauthorized address calls commit()", async function () {
      const amount = ethers.parseUnits("100", 6);
      await expect(
        policyGuard.connect(unauthorized).commit(amount)
      ).to.be.revertedWithCustomError(policyGuard, "PolicyGuard__NotOperator");
    });

    it("should allow operator to update authorized caller", async function () {
      await expect(
        policyGuard.connect(owner).setAuthorizedCaller(unauthorized.address)
      ).to.emit(policyGuard, "AuthorizedCallerUpdated");
      
      expect(await policyGuard.authorizedCaller()).to.equal(unauthorized.address);
    });

    it("should revert when non-operator tries to set authorized caller", async function () {
      await expect(
        policyGuard.connect(unauthorized).setAuthorizedCaller(unauthorized.address)
      ).to.be.revertedWith("Only operator");
    });
  });

  describe("Daily spending tracking", function () {
    it("should track daily spending correctly after authorized commit", async function () {
      const amount1 = ethers.parseUnits("100", 6);
      const amount2 = ethers.parseUnits("200", 6);

      await policyGuard.connect(authorizedCaller).commit(amount1);
      await policyGuard.connect(authorizedCaller).commit(amount2);

      const [spent] = await policyGuard.getDailyStats();
      expect(spent).to.equal(amount1 + amount2);
    });

    it("should prevent unauthorized from inflating daily spending", async function () {
      const amount = ethers.parseUnits("999999", 6);
      await expect(
        policyGuard.connect(unauthorized).commit(amount)
      ).to.be.revertedWithCustomError(policyGuard, "PolicyGuard__NotOperator");

      const [spent] = await policyGuard.getDailyStats();
      expect(spent).to.equal(0);
    });
  });
});
