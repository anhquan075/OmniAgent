import { describe, it, expect, beforeEach } from "vitest";
import { ethers } from "hardhat";
import { AgentRiskParameters } from "../typechain-types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("AgentRiskParameters", () => {
  let agentRiskParams: AgentRiskParameters;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;
  let addr2: HardhatEthersSigner;

  const validParams = {
    maxRiskPercentageBps: 500n, // 5%
    dailyMaxTransactions: 10n,
    dailyMaxVolumeUsdt: ethers.parseUnits("1000000", 6), // 1M USDT (already BigInt from parseUnits)
    maxSlippageBps: 500n, // 5%
    minHealthFactor: ethers.parseUnits("1.5", 18),
    emergencyHealthFactor: ethers.parseUnits("1.2", 18),
    maxConsecutiveFailures: 3n,
    circuitBreakerCooldownSeconds: 60n,
    oracleMaxAgeSeconds: 300n,
    healthFactorVelocityThresholdBps: 10n,
  };

  beforeEach(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();
  });

  describe("Constructor Validation", () => {
    it("should deploy with valid parameters", async () => {
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
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("should reject maxRiskPercentageBps > 10000", async () => {
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
      ).rejects.toThrow("Risk > 100%");
    });

    it("should reject maxSlippageBps > 10000", async () => {
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
      ).rejects.toThrow("Slippage > 100%");
    });

    it("should reject minHealthFactor < emergencyHealthFactor", async () => {
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
      ).rejects.toThrow("Invalid HF");
    });
  });

  describe("Immutability", () => {
    beforeEach(async () => {
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

    it("should not have any state-mutating functions (besides constructor)", async () => {
      const abi = agentRiskParams.interface;
      const mutateFunctions = abi.fragments.filter(
        (fragment: any) => 
          fragment.type === "function" && 
          fragment.stateMutability !== "view" && 
          fragment.stateMutability !== "pure"
      );

      expect(mutateFunctions.length).toBe(0);
    });

    it("should return consistent values across multiple calls", async () => {
      const params1 = await agentRiskParams.getAllParameters();
      const params2 = await agentRiskParams.getAllParameters();

      expect(params1.maxRiskPercentageBps).toBe(params2.maxRiskPercentageBps);
      expect(params1.dailyMaxTransactions).toBe(params2.dailyMaxTransactions);
      expect(params1.minHealthFactor).toBe(params2.minHealthFactor);
    });
  });

  describe("Getter Functions", () => {
    beforeEach(async () => {
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

    it("should return all parameters correctly via getAllParameters", async () => {
      const params = await agentRiskParams.getAllParameters();

      expect(params.maxRisk).to.equal(validParams.maxRiskPercentageBps);
      expect(params.maxTx).to.equal(validParams.dailyMaxTransactions);
      expect(params.maxVolume).to.equal(validParams.dailyMaxVolumeUsdt);
      expect(params.maxSlippage).to.equal(validParams.maxSlippageBps);
      expect(params.minHF).to.equal(validParams.minHealthFactor);
      expect(params.emergencyHF).to.equal(validParams.emergencyHealthFactor);
      expect(params.maxFailures).to.equal(validParams.maxConsecutiveFailures);
      expect(params.cooldown).to.equal(validParams.circuitBreakerCooldownSeconds);
      expect(params.maxOracleAge).to.equal(validParams.oracleMaxAgeSeconds);
      expect(params.hfVelocity).to.equal(validParams.healthFactorVelocityThresholdBps);
    });

    it("should return whitelisted protocols", async () => {
      const protocols = await agentRiskParams.getWhitelistedProtocols();
      
      expect(protocols.length).toBe(1);
      expect(protocols[0]).toBe(addr1.address);
    });

    it("should return whitelisted tokens", async () => {
      const tokens = await agentRiskParams.getWhitelistedTokens();
      
      expect(tokens.length).toBe(1);
      expect(tokens[0]).toBe(addr2.address);
    });

    it("should correctly identify whitelisted protocol", async () => {
      expect(await agentRiskParams.isProtocolWhitelisted(addr1.address)).toBe(true);
      expect(await agentRiskParams.isProtocolWhitelisted(owner.address)).toBe(false);
    });

    it("should correctly identify whitelisted token", async () => {
      expect(await agentRiskParams.isTokenWhitelisted(addr2.address)).toBe(true);
      expect(await agentRiskParams.isTokenWhitelisted(owner.address)).toBe(false);
    });
  });

  describe("Gas Cost Benchmarks", () => {
    beforeEach(async () => {
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

    it("should read all parameters with < 50k gas", async () => {
      const tx = await agentRiskParams.getAllParameters.estimateGas();
      
      console.log(`Gas cost for getAllParameters(): ${tx}`);
      expect(Number(tx)).toBeLessThan(50000);
    });

    it("should check protocol whitelist with < 30k gas", async () => {
      const tx = await agentRiskParams.isProtocolWhitelisted.estimateGas(addr1.address);
      
      console.log(`Gas cost for isProtocolWhitelisted(): ${tx}`);
      expect(Number(tx)).toBeLessThan(30000);
    });

    it("should check token whitelist with < 30k gas", async () => {
      const tx = await agentRiskParams.isTokenWhitelisted.estimateGas(addr2.address);
      
      console.log(`Gas cost for isTokenWhitelisted(): ${tx}`);
      expect(Number(tx)).toBeLessThan(30000);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty whitelist arrays", async () => {
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

      expect(protocols.length).toBe(0);
      expect(tokens.length).toBe(0);
    });

    it("should handle boundary values for risk percentage (0%)", async () => {
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
      expect(params.maxRisk).to.equal(0n);
    });

    it("should handle boundary values for risk percentage (100%)", async () => {
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
      expect(params.maxRisk).to.equal(10000n);
    });

    it("should handle equal minHealthFactor and emergencyHealthFactor", async () => {
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
      expect(params.minHealthFactor).toBe(params.emergencyHealthFactor);
    });
  });

  describe("Event Emission", () => {
    it("should emit ParametersDeployed event on deployment", async () => {
      const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
      
      const contract = await AgentRiskParameters.deploy(
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

      // Wait for deployment and get receipt
      const receipt = await contract.deploymentTransaction()?.wait();
      
      // Check that ParametersDeployed event was emitted
      const event = receipt?.logs.find(
        (log: any) => {
          try {
            const parsed = contract.interface.parseLog(log);
            return parsed?.name === "ParametersDeployed";
          } catch {
            return false;
          }
        }
      );
      
      expect(event).toBeDefined();
    });
  });
});
