
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PolicyGuard, SafetyPolicy } from '../../src/agent/middleware/PolicyGuard';
import { ProfitSimulator } from '../../src/agent/services/ProfitSimulator';
import { ethers } from 'ethers';
import axios from 'axios';

vi.mock('axios');

vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers');
  return {
    ...actual,
    JsonRpcProvider: vi.fn().mockImplementation(() => ({
      getFeeData: vi.fn().mockResolvedValue({
        gasPrice: 5000000000n, // 5 gwei
      }),
    })),
  };
});

describe('Phase 1 Core Upgrades Verification', () => {
  
  describe('PolicyGuard (Safety Layer)', () => {
    let policyGuard: PolicyGuard;
    const mockPolicy: SafetyPolicy = {
      maxRiskPercentage: 10,
      dailyMaxTransactions: 5,
      dailyMaxVolume: ethers.parseUnits('1000', 6).toString(),
      whitelistedAddresses: new Set(),
      maxSlippageBps: 100,
      emergencyBreaker: false,
    };

    beforeEach(() => {
      policyGuard = new PolicyGuard(mockPolicy);
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          binancecoin: {
            usd: 600,
          },
        },
      });
    });

    it('should block transactions when emergency breaker is active', () => {
      policyGuard.activateEmergency();
      const result = policyGuard.validateSwapTransaction({
        fromToken: 'USDT',
        toToken: 'BNB',
        amount: '1000000',
        currentRiskLevel: 'LOW',
        portfolioValue: '100000000',
      });

      expect(result.violated).toBe(true);
      expect(result.reason).toContain('Emergency breaker is active');
    });

    it('should block high risk level trades', () => {
      const result = policyGuard.validateSwapTransaction({
        fromToken: 'USDT',
        toToken: 'BNB',
        amount: '1000000',
        currentRiskLevel: 'HIGH',
        portfolioValue: '100000000',
      });

      expect(result.violated).toBe(true);
      expect(result.reason).toContain('risk is HIGH');
    });

    it('should block trades exceeding daily max transactions', () => {
      for (let i = 0; i < 5; i++) {
        policyGuard.recordTransaction('100000');
      }

      const result = policyGuard.validateSwapTransaction({
        fromToken: 'USDT',
        toToken: 'BNB',
        amount: '100000',
        currentRiskLevel: 'LOW',
        portfolioValue: '100000000',
      });

      expect(result.violated).toBe(true);
      expect(result.reason).toContain('Daily transaction limit');
    });

    it('should block trades exceeding daily volume', () => {
      const result = policyGuard.validateSwapTransaction({
        fromToken: 'USDT',
        toToken: 'BNB',
        amount: ethers.parseUnits('1001', 6).toString(),
        currentRiskLevel: 'LOW',
        portfolioValue: ethers.parseUnits('5000', 6).toString(),
      });

      expect(result.violated).toBe(true);
      expect(result.reason).toContain('Daily volume limit');
    });

    it('should block trades exceeding max risk percentage', () => {
      const result = policyGuard.validateSwapTransaction({
        fromToken: 'USDT',
        toToken: 'BNB',
        amount: ethers.parseUnits('20', 6).toString(),
        currentRiskLevel: 'LOW',
        portfolioValue: ethers.parseUnits('100', 6).toString(),
      });

      expect(result.violated).toBe(true);
      expect(result.reason).toContain('exceeds max risk');
    });

    it('should allow safe transactions', () => {
      const result = policyGuard.validateSwapTransaction({
        fromToken: 'USDT',
        toToken: 'BNB',
        amount: ethers.parseUnits('1', 6).toString(),
        currentRiskLevel: 'LOW',
        portfolioValue: ethers.parseUnits('100', 6).toString(),
      });

      expect(result.violated).toBe(false);
    });
  });

  describe('ProfitSimulator (Economic Layer)', () => {
    let simulator: ProfitSimulator;

    beforeEach(() => {
      simulator = new ProfitSimulator('https://mock-rpc.com');
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          binancecoin: {
            usd: 600,
          },
        },
      });
    });

    it('should estimate gas correctly', async () => {
      const estimate = await simulator.estimateSwapGas({
        fromToken: 'USDT',
        toToken: 'BNB',
        amount: '1000000',
      });

      expect(estimate.gasUsed).toBeDefined();
      expect(estimate.totalGasCost).toBeDefined();
    });

    it('should calculate yield projection correctly', () => {
      const projection = simulator.calculateYieldProjection({
        principalAmount: '1000000',
        apy: 10,
        timeframe: 'yearly',
      });

      expect(projection.projectedYield).toBe('100000');
      expect(projection.yieldPercentage).toBe(10);
    });

    it('should simulate swap profitability', async () => {
      const result = await simulator.simulateSwap({
        inputAmount: '1000000',
        inputToken: 'USDT',
        outputToken: 'USDC',
        expectedOutput: '1000000',
        slippage: 0.5,
      });

      expect(result.action).toBe('SWAP');
      expect(result.netProfit).toBeDefined();
      expect(BigInt(result.netProfit)).toBeLessThan(0n);
    });
  });
});
