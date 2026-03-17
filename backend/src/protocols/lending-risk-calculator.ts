import { ethers } from 'ethers';
import { logger } from '../utils/logger';

export interface LendingRiskProfile {
  healthFactor: number;
  totalCollateral: bigint;
  totalDebt: bigint;
  isLiquidatable: boolean;
}

export class LendingRiskCalculator {
  private static MIN_SAFE_HEALTH_FACTOR = 1.5;

  /**
   * Calculate health factor from collateral and debt values
   * Health Factor = (Total Collateral * Liquidation Threshold) / Total Debt
   * @param totalCollateral Total collateral value in USDT wei
   * @param totalDebt Total debt value in USDT wei
   * @param liquidationThreshold Liquidation threshold (default 0.85 for Aave V3 USDT)
   * @returns Health factor as number
   */
  static calculateHealthFactor(
    totalCollateral: bigint, 
    totalDebt: bigint, 
    liquidationThreshold: number = 0.85
  ): number {
    if (totalDebt === 0n) return Infinity;
    
    // Convert threshold to wei for calculation
    const thresholdWei = BigInt(Math.floor(liquidationThreshold * 1e18));
    
    // Health Factor = (collateral * threshold) / debt
    const healthFactorWei = (totalCollateral * thresholdWei) / totalDebt;
    
    return parseFloat(ethers.formatUnits(healthFactorWei, 18));
  }

  static calculateHealthFactorFromRaw(healthFactorRaw: bigint): number {
    return parseFloat(ethers.formatUnits(healthFactorRaw, 18));
  }

  static isSafe(healthFactor: number): boolean {
    return healthFactor >= this.MIN_SAFE_HEALTH_FACTOR;
  }

  static shouldEmergencyWithdraw(healthFactor: number, threshold: number = 1.1): boolean {
    return healthFactor <= threshold;
  }

  static getMaxSafeLending(portfolioValue: bigint, allocationLimitBps: number): bigint {
    return (portfolioValue * BigInt(allocationLimitBps)) / 10000n;
  }

  /**
   * Get recommended lending amount based on risk parameters
   * @param portfolioValue Total portfolio value in USDT wei
   * @param currentAaveBalance Current Aave balance in USDT wei
   * @param maxAllocationBps Max allocation in basis points (default 3000 = 30%)
   * @returns Max safe amount to lend in USDT wei
   */
  static getMaxSafeLendingAmount(
    portfolioValue: bigint, 
    currentAaveBalance: bigint = 0n, 
    maxAllocationBps: number = 3000
  ): bigint {
    const maxAllocation = (portfolioValue * BigInt(maxAllocationBps)) / 10000n;
    
    if (currentAaveBalance >= maxAllocation) {
      return 0n;
    }
    
    return maxAllocation - currentAaveBalance;
  }
}
