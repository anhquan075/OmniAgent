import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentRiskParameters } from "../../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("AgentRiskParameters", function () {
  let agentRiskParams: AgentRiskParameters;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;
  let addr2: HardhatEthersSigner;

  const validParams = {
    maxRiskPercentageBps: 500, // 5%
    dailyMaxTransactions: 10,
    dailyMaxVolumeUsdt: ethers.parseUnits("1000000", 6), // 1M USDT
    maxSlippageBps: 500, // 5%
    minHealthFactor: ethers.parseUnits("1.5", 18),
    emergencyHealthFactor: ethers.parseUnits("1.2", 18),
    maxConsecutiveFailures: 3,
    circuitBreakerCooldownSeconds: 60,
    oracleMaxAgeSeconds: 300,
    healthFactorVelocityThresholdBps: 10,
  };

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
  });

  describe("Constructor Validation", function () {
    it("Should deploy with valid parameters", async function () {
      const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
      agentRiskParams = await AgentRiskParameters.deploy(
        validParams.maxRiskPercentageBps,
        validParams.dailyMaxTransactions,
        validParams.dailyMaxVolumeUsdt,
        validParams.maxSlippageBps,
        validParams.minHealthFactor,
        validParams.emergencyHealthFactor,
        validParams.maxConsecutiveFailures,
        validParams.circuitBreakerCooldownSeconds,
        validParams.oracleMaxAgeSeconds,
        validParams.healthFactorVelocityThresholdBps,
        [addr1.address],
        [addr2.address]
      );

      const address = await agentRiskParams.getAddress();
      expect(address).to.match(/^0x[a-fA-F0-9]{40}$/);
    });

    it("Should reject maxRiskPercentageBps > 10000", async function () {
      const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
      
      await expect(
        AgentRiskParameters.deploy(
          10001, // Invalid: > 100%
          validParams.dailyMaxTransactions,
          validParams.dailyMaxVolumeUsdt,
          validParams.maxSlippageBps,
          validParams.minHealthFactor,
          validParams.emergencyHealthFactor,
          validParams.maxConsecutiveFailures,
          validParams.circuitBreakerCooldownSeconds,
          validParams.oracleMaxAgeSeconds,
          validParams.healthFactorVelocityThresholdBps,
          [],
          []
        )
      ).to.be.revertedWith("Invalid risk percentage");
    });

    it("Should reject maxSlippageBps > 10000", async function () {
      const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
      
      await expect(
        AgentRiskParameters.deploy(
          validParams.maxRiskPercentageBps,
          validParams.dailyMaxTransactions,
          validParams.dailyMaxVolumeUsdt,
          10001, // Invalid: > 100%
          validParams.minHealthFactor,
          validParams.emergencyHealthFactor,
          validParams.maxConsecutiveFailures,
          validParams.circuitBreakerCooldownSeconds,
          validParams.oracleMaxAgeSeconds,
          validParams.healthFactorVelocityThresholdBps,
          [],
          []
        )
      ).to.be.revertedWith("Invalid slippage");
    });

    it("Should reject minHealthFactor < emergencyHealthFactor", async function () {
      const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
      
      await expect(
        AgentRiskParameters.deploy(
          validParams.maxRiskPercentageBps,
          validParams.dailyMaxTransactions,
          validParams.dailyMaxVolumeUsdt,
          validParams.maxSlippageBps,
          ethers.parseUnits("1.1", 18), // min < emergency
          ethers.parseUnits("1.5", 18),
          validParams.maxConsecutiveFailures,
          validParams.circuitBreakerCooldownSeconds,
          validParams.oracleMaxAgeSeconds,
          validParams.healthFactorVelocityThresholdBps,
          [],
          []
        )
      ).to.be.revertedWith("Invalid health factor bounds");
    });
  });

  describe("Immutability", function () {
    beforeEach(async function () {
      const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
      agentRiskParams = await AgentRiskParameters.deploy(
        validParams.maxRiskPercentageBps,
        validParams.dailyMaxTransactions,
        validParams.dailyMaxVolumeUsdt,
        validParams.maxSlippageBps,
        validParams.minHealthFactor,
        validParams.emergencyHealthFactor,
        validParams.maxConsecutiveFailures,
        validParams.circuitBreakerCooldownSeconds,
        validParams.oracleMaxAgeSeconds,
        validParams.healthFactorVelocityThresholdBps,
        [addr1.address],
        [addr2.address]
      );
    });

    it("Should not have any state-mutating functions (besides constructor)", async function () {
      const abi = agentRiskParams.interface;
      const mutateFunctions = abi.fragments.filter(
        (fragment: any) => 
          fragment.type === "function" && 
          fragment.stateMutability !== "view" && 
          fragment.stateMutability !== "pure"
      );

      expect(mutateFunctions.length).to.equal(0, "Contract should have no state-mutating functions");
    });

    it("Should return consistent values across multiple calls", async function () {
      const params1 = await agentRiskParams.getAllParameters();
      const params2 = await agentRiskParams.getAllParameters();

      expect(params1.maxRiskPercentageBps).to.equal(params2.maxRiskPercentageBps);
      expect(params1.dailyMaxTransactions).to.equal(params2.dailyMaxTransactions);
      expect(params1.minHealthFactor).to.equal(params2.minHealthFactor);
    });
  });

  describe("Getter Functions", function () {
    beforeEach(async function () {
      const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
      agentRiskParams = await AgentRiskParameters.deploy(
        validParams.maxRiskPercentageBps,
        validParams.dailyMaxTransactions,
        validParams.dailyMaxVolumeUsdt,
        validParams.maxSlippageBps,
        validParams.minHealthFactor,
        validParams.emergencyHealthFactor,
        validParams.maxConsecutiveFailures,
        validParams.circuitBreakerCooldownSeconds,
        validParams.oracleMaxAgeSeconds,
        validParams.healthFactorVelocityThresholdBps,
        [addr1.address],
        [addr2.address]
      );
    });

    it("Should return all parameters correctly via getAllParameters", async function () {
      const params = await agentRiskParams.getAllParameters();

      expect(params.maxRiskPercentageBps).to.equal(validParams.maxRiskPercentageBps);
      expect(params.dailyMaxTransactions).to.equal(validParams.dailyMaxTransactions);
      expect(params.dailyMaxVolumeUsdt).to.equal(validParams.dailyMaxVolumeUsdt);
      expect(params.maxSlippageBps).to.equal(validParams.maxSlippageBps);
      expect(params.minHealthFactor).to.equal(validParams.minHealthFactor);
      expect(params.emergencyHealthFactor).to.equal(validParams.emergencyHealthFactor);
      expect(params.maxConsecutiveFailures).to.equal(validParams.maxConsecutiveFailures);
      expect(params.circuitBreakerCooldownSeconds).to.equal(validParams.circuitBreakerCooldownSeconds);
      expect(params.oracleMaxAgeSeconds).to.equal(validParams.oracleMaxAgeSeconds);
      expect(params.healthFactorVelocityThresholdBps).to.equal(validParams.healthFactorVelocityThresholdBps);
    });

    it("Should return whitelisted protocols", async function () {
      const protocols = await agentRiskParams.getWhitelistedProtocols();
      
      expect(protocols.length).to.equal(1);
      expect(protocols[0]).to.equal(addr1.address);
    });

    it("Should return whitelisted tokens", async function () {
      const tokens = await agentRiskParams.getWhitelistedTokens();
      
      expect(tokens.length).to.equal(1);
      expect(tokens[0]).to.equal(addr2.address);
    });

    it("Should correctly identify whitelisted protocol", async function () {
      expect(await agentRiskParams.isProtocolWhitelisted(addr1.address)).to.be.true;
      expect(await agentRiskParams.isProtocolWhitelisted(owner.address)).to.be.false;
    });

    it("Should correctly identify whitelisted token", async function () {
      expect(await agentRiskParams.isTokenWhitelisted(addr2.address)).to.be.true;
      expect(await agentRiskParams.isTokenWhitelisted(owner.address)).to.be.false;
    });
  });

  describe("Gas Cost Benchmarks", function () {
    beforeEach(async function () {
      const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
      agentRiskParams = await AgentRiskParameters.deploy(
        validParams.maxRiskPercentageBps,
        validParams.dailyMaxTransactions,
        validParams.dailyMaxVolumeUsdt,
        validParams.maxSlippageBps,
        validParams.minHealthFactor,
        validParams.emergencyHealthFactor,
        validParams.maxConsecutiveFailures,
        validParams.circuitBreakerCooldownSeconds,
        validParams.oracleMaxAgeSeconds,
        validParams.healthFactorVelocityThresholdBps,
        [addr1.address, owner.address],
        [addr2.address, owner.address]
      );
    });

    it("Should read all parameters with < 50k gas", async function () {
      const tx = await agentRiskParams.getAllParameters.estimateGas();
      
      console.log(`      ℹ Gas cost for getAllParameters(): ${tx}`);
      expect(tx).to.be.lessThan(50000n, "getAllParameters should cost < 50k gas");
    });

    it("Should check protocol whitelist with < 10k gas", async function () {
      const tx = await agentRiskParams.isProtocolWhitelisted.estimateGas(addr1.address);
      
      console.log(`      ℹ Gas cost for isProtocolWhitelisted(): ${tx}`);
      expect(tx).to.be.lessThan(10000n, "isProtocolWhitelisted should cost < 10k gas");
    });

    it("Should check token whitelist with < 10k gas", async function () {
      const tx = await agentRiskParams.isTokenWhitelisted.estimateGas(addr2.address);
      
      console.log(`      ℹ Gas cost for isTokenWhitelisted(): ${tx}`);
      expect(tx).to.be.lessThan(10000n, "isTokenWhitelisted should cost < 10k gas");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle empty whitelist arrays", async function () {
      const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
      agentRiskParams = await AgentRiskParameters.deploy(
        validParams.maxRiskPercentageBps,
        validParams.dailyMaxTransactions,
        validParams.dailyMaxVolumeUsdt,
        validParams.maxSlippageBps,
        validParams.minHealthFactor,
        validParams.emergencyHealthFactor,
        validParams.maxConsecutiveFailures,
        validParams.circuitBreakerCooldownSeconds,
        validParams.oracleMaxAgeSeconds,
        validParams.healthFactorVelocityThresholdBps,
        [], // Empty protocols
        []  // Empty tokens
      );

      const protocols = await agentRiskParams.getWhitelistedProtocols();
      const tokens = await agentRiskParams.getWhitelistedTokens();

      expect(protocols.length).to.equal(0);
      expect(tokens.length).to.equal(0);
    });

    it("Should handle boundary values for risk percentage (0%)", async function () {
      const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
      agentRiskParams = await AgentRiskParameters.deploy(
        0, // 0% risk (valid)
        validParams.dailyMaxTransactions,
        validParams.dailyMaxVolumeUsdt,
        validParams.maxSlippageBps,
        validParams.minHealthFactor,
        validParams.emergencyHealthFactor,
        validParams.maxConsecutiveFailures,
        validParams.circuitBreakerCooldownSeconds,
        validParams.oracleMaxAgeSeconds,
        validParams.healthFactorVelocityThresholdBps,
        [],
        []
      );

      const params = await agentRiskParams.getAllParameters();
      expect(params.maxRiskPercentageBps).to.equal(0);
    });

    it("Should handle boundary values for risk percentage (100%)", async function () {
      const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
      agentRiskParams = await AgentRiskParameters.deploy(
        10000, // 100% risk (valid)
        validParams.dailyMaxTransactions,
        validParams.dailyMaxVolumeUsdt,
        validParams.maxSlippageBps,
        validParams.minHealthFactor,
        validParams.emergencyHealthFactor,
        validParams.maxConsecutiveFailures,
        validParams.circuitBreakerCooldownSeconds,
        validParams.oracleMaxAgeSeconds,
        validParams.healthFactorVelocityThresholdBps,
        [],
        []
      );

      const params = await agentRiskParams.getAllParameters();
      expect(params.maxRiskPercentageBps).to.equal(10000);
    });

    it("Should handle equal minHealthFactor and emergencyHealthFactor", async function () {
      const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
      const equalHF = ethers.parseUnits("1.5", 18);
      
      agentRiskParams = await AgentRiskParameters.deploy(
        validParams.maxRiskPercentageBps,
        validParams.dailyMaxTransactions,
        validParams.dailyMaxVolumeUsdt,
        validParams.maxSlippageBps,
        equalHF,
        equalHF, // Equal to min (valid boundary)
        validParams.maxConsecutiveFailures,
        validParams.circuitBreakerCooldownSeconds,
        validParams.oracleMaxAgeSeconds,
        validParams.healthFactorVelocityThresholdBps,
        [],
        []
      );

      const params = await agentRiskParams.getAllParameters();
      expect(params.minHealthFactor).to.equal(params.emergencyHealthFactor);
    });
  });

  describe("Event Emission", function () {
    it("Should emit ParametersDeployed event on deployment", async function () {
      const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
      
      await expect(
        AgentRiskParameters.deploy(
          validParams.maxRiskPercentageBps,
          validParams.dailyMaxTransactions,
          validParams.dailyMaxVolumeUsdt,
          validParams.maxSlippageBps,
          validParams.minHealthFactor,
          validParams.emergencyHealthFactor,
          validParams.maxConsecutiveFailures,
          validParams.circuitBreakerCooldownSeconds,
          validParams.oracleMaxAgeSeconds,
          validParams.healthFactorVelocityThresholdBps,
          [addr1.address],
          [addr2.address]
        )
      ).to.emit(AgentRiskParameters, "ParametersDeployed")
        .withArgs(
          validParams.maxRiskPercentageBps,
          validParams.dailyMaxTransactions,
          validParams.dailyMaxVolumeUsdt,
          validParams.minHealthFactor,
          validParams.emergencyHealthFactor
        );
    });
  });
});
