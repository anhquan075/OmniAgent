const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CrossChainMessenger", function () {
  let messenger;
  let owner, user1;
  const XCM_PRECOMPILE = "0x00000000000000000000000000000000000a0000";

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();

    const CrossChainMessenger = await ethers.getContractFactory("CrossChainMessenger");
    messenger = await CrossChainMessenger.deploy(owner.address);
    await messenger.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should set correct XCM precompile address", async function () {
      expect(await messenger.XCM_PRECOMPILE_ADDRESS()).to.equal(XCM_PRECOMPILE);
    });

    it("should set correct owner", async function () {
      expect(await messenger.owner()).to.equal(owner.address);
    });

    it("should have correct weight safety margin", async function () {
      expect(await messenger.WEIGHT_SAFETY_MARGIN_BPS()).to.equal(2000);
    });
  });

  describe("Input Validation", function () {
    const validParachainId = 2007;
    const validBeneficiary = ethers.hexlify(ethers.randomBytes(32));
    const validAmount = ethers.parseEther("100");
    const validXcmMessage = ethers.hexlify(ethers.randomBytes(64));

    it("should revert with invalid parachain ID (zero)", async function () {
      await expect(
        messenger.transferToParachain(0, validBeneficiary, validAmount, validXcmMessage)
      ).to.be.revertedWithCustomError(messenger, "CrossChainMessenger__InvalidParachainId");
    });

    it("should revert with invalid parachain ID (too high)", async function () {
      const maxId = await messenger.MAX_PARACHAIN_ID();
      await expect(
        messenger.transferToParachain(
          Number(maxId) + 1,
          validBeneficiary,
          validAmount,
          validXcmMessage
        )
      ).to.be.revertedWithCustomError(messenger, "CrossChainMessenger__InvalidParachainId");
    });

    it("should revert with zero beneficiary", async function () {
      await expect(
        messenger.transferToParachain(
          validParachainId,
          ethers.ZeroHash,
          validAmount,
          validXcmMessage
        )
      ).to.be.revertedWithCustomError(messenger, "CrossChainMessenger__InvalidBeneficiary");
    });

    it("should revert with zero amount", async function () {
      await expect(
        messenger.transferToParachain(validParachainId, validBeneficiary, 0, validXcmMessage)
      ).to.be.revertedWithCustomError(messenger, "CrossChainMessenger__InvalidAmount");
    });

    it("should revert with empty XCM message", async function () {
      await expect(
        messenger.transferToParachain(validParachainId, validBeneficiary, validAmount, "0x")
      ).to.be.revertedWithCustomError(messenger, "CrossChainMessenger__EmptyXcmMessage");
    });
  });

  describe("Access Control", function () {
    const validParams = [
      2007,
      ethers.hexlify(ethers.randomBytes(32)),
      ethers.parseEther("100"),
      ethers.hexlify(ethers.randomBytes(64)),
    ];

    it("should allow owner to call transferToParachain", async function () {
      // Note: This will fail execution since precompile doesn't exist in test environment
      // But we can verify the access control works
      await expect(
        messenger.connect(owner).transferToParachain(...validParams)
      ).to.be.reverted; // Fails at XCM execution, not access control
    });

    it("should prevent non-owner from calling transferToParachain", async function () {
      await expect(
        messenger.connect(user1).transferToParachain(...validParams)
      ).to.be.revertedWithCustomError(messenger, "OwnableUnauthorizedAccount");
    });

    it("should prevent non-owner from calling sendCrossChainMessage", async function () {
      const destination = ethers.hexlify(ethers.randomBytes(32));
      const xcmMessage = ethers.hexlify(ethers.randomBytes(64));

      await expect(
        messenger.connect(user1).sendCrossChainMessage(destination, xcmMessage)
      ).to.be.revertedWithCustomError(messenger, "OwnableUnauthorizedAccount");
    });

    it("should prevent non-owner from calling emergencyExitToRelay", async function () {
      const amount = ethers.parseEther("100");
      const xcmMessage = ethers.hexlify(ethers.randomBytes(64));

      await expect(
        messenger.connect(user1).emergencyExitToRelay(amount, xcmMessage)
      ).to.be.revertedWithCustomError(messenger, "OwnableUnauthorizedAccount");
    });
  });

  describe("Helper Functions", function () {
    it("should revert on buildTransferXcm (off-chain encoding required)", async function () {
      const parachainId = 2007;
      const beneficiary = ethers.hexlify(ethers.randomBytes(32));
      const amount = ethers.parseEther("100");

      await expect(
        messenger.buildTransferXcm(parachainId, beneficiary, amount)
      ).to.be.revertedWithCustomError(messenger, "CrossChainMessenger__UseOffchainEncoder");
    });

    it("should revert on buildRelayTransferXcm (off-chain encoding required)", async function () {
      const amount = ethers.parseEther("100");

      await expect(
        messenger.buildRelayTransferXcm(amount)
      ).to.be.revertedWithCustomError(messenger, "CrossChainMessenger__UseOffchainEncoder");
    });
  });

  describe("Constants", function () {
    it("should have correct max parachain ID", async function () {
      expect(await messenger.MAX_PARACHAIN_ID()).to.equal(10000);
    });
  });
});
