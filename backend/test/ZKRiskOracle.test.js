const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ZKRiskOracle Proof Verification", function () {
  let oracle;
  let owner;
  let verifier;
  let unauthorized;

  async function deployFixture() {
    [owner, verifier, unauthorized] = await ethers.getSigners();

    const ZKRiskOracle = await ethers.getContractFactory("ZKRiskOracle");
    oracle = await ZKRiskOracle.deploy(verifier.address);
    await oracle.waitForDeployment();
  }

  beforeEach(async function () {
    await deployFixture();
  });

  describe("Proof storage", function () {
    it("should store proof hash when fulfillRiskCalculation is called", async function () {
      const proof = ethers.toUtf8Bytes("test-proof-data-123");
      const proofHash = ethers.keccak256(proof);

      await oracle.connect(verifier).fulfillRiskCalculation(
        ethers.ZeroHash,
        proof,
        100, // sharpe
        500, // drawdown
        200  // buffer
      );

      expect(await oracle.isProofVerified(proofHash)).to.be.true;
    });

    it("should emit ProofVerified event", async function () {
      const proof = ethers.toUtf8Bytes("test-proof-data-456");
      const proofHash = ethers.keccak256(proof);

      await expect(
        oracle.connect(verifier).fulfillRiskCalculation(
          ethers.ZeroHash,
          proof,
          100,
          500,
          200
        )
      ).to.emit(oracle, "ProofVerified");
    });

    it("should return false for unverified proof hash", async function () {
      const unverifiedHash = ethers.keccak256(ethers.toUtf8Bytes("unverified"));
      expect(await oracle.isProofVerified(unverifiedHash)).to.be.false;
    });

    it("should revert when unauthorized calls fulfillRiskCalculation", async function () {
      const proof = ethers.toUtf8Bytes("test-proof");
      await expect(
        oracle.connect(unauthorized).fulfillRiskCalculation(
          ethers.ZeroHash,
          proof,
          100,
          500,
          200
        )
      ).to.be.revertedWithCustomError(oracle, "ZKRiskOracle__UnauthorizedVerifier");
    });
  });

  describe("Multiple proofs", function () {
    it("should track multiple proofs independently", async function () {
      const proof1 = ethers.toUtf8Bytes("proof-1");
      const proof2 = ethers.toUtf8Bytes("proof-2");
      const hash1 = ethers.keccak256(proof1);
      const hash2 = ethers.keccak256(proof2);

      await oracle.connect(verifier).fulfillRiskCalculation(
        ethers.ZeroHash, proof1, 100, 500, 200
      );
      await oracle.connect(verifier).fulfillRiskCalculation(
        ethers.ZeroHash, proof2, 150, 300, 250
      );

      expect(await oracle.isProofVerified(hash1)).to.be.true;
      expect(await oracle.isProofVerified(hash2)).to.be.true;
    });
  });
});
