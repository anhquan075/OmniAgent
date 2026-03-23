import { env } from '@/config/env';
import { logger } from '@/utils/logger';

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface YieldOpportunity {
  protocol: string;
  apy: number;
  risk: 'low' | 'medium' | 'high';
  tvl: string;
}

/**
 * OpenClawPolicyEnforcer
 * 
 * Enforces financial policies for OpenClaw agent operations:
 * - Transaction size limits
 * - Yield opportunity validation
 * - Risk-based APY requirements
 */
export class OpenClawPolicyEnforcer {
  private maxExposurePercent: number;
  private minApy: number;
  private highRiskMultiplier: number;

  constructor() {
    this.maxExposurePercent = Number(env.MAX_OPENCLAW_EXPOSURE_PERCENT) || 20;
    this.minApy = Number(env.MIN_OPENCLAW_APY) || 8.5;
    this.highRiskMultiplier = 1.5;

    logger.info({
      maxExposurePercent: this.maxExposurePercent,
      minApy: this.minApy,
      highRiskMultiplier: this.highRiskMultiplier,
    }, '[OpenClawPolicyEnforcer] Initialized');
  }

  /**
   * Check if a transaction is allowed based on policy rules
   * 
   * @param to - Target address
   * @param amount - Transaction amount in wei
   * @param data - Transaction data
   */
  async checkTransaction(
    to: string,
    amount: string,
    data: string
  ): Promise<PolicyCheckResult> {
    const amountNum = Number(amount);

    // Small transactions always allowed (dust protection)
    if (amountNum < 1000000) { // < 1e-6 ETH
      return { allowed: true, riskLevel: 'LOW' };
    }

    // Large transactions need exposure check
    if (amountNum > 1000000000000000000) { // > 1 ETH
      return {
        allowed: false,
        reason: 'Transaction exceeds maximum single transfer limit',
        riskLevel: 'HIGH',
      };
    }

    // Medium transactions allowed with warning
    if (amountNum > 100000000000000000) { // > 0.1 ETH
      return {
        allowed: true,
        reason: 'Medium transaction size - ensure target is trusted',
        riskLevel: 'MEDIUM',
      };
    }

    return { allowed: true, riskLevel: 'LOW' };
  }

  /**
   * Validate a yield opportunity based on APY and risk
   * 
   * @param protocol - Protocol name
   * @param apy - Annual percentage yield
   * @param riskLevel - Risk level (low, medium, high)
   */
  async checkYieldOpportunity(
    protocol: string,
    apy: number,
    riskLevel: 'low' | 'medium' | 'high'
  ): Promise<PolicyCheckResult> {
    // Low risk opportunities require minimum APY
    if (riskLevel === 'low') {
      if (apy >= this.minApy) {
        return {
          allowed: true,
          reason: `${protocol} yield meets minimum APY requirement (${apy}% >= ${this.minApy}%)`,
          riskLevel: 'LOW',
        };
      }
      return {
        allowed: false,
        reason: `${protocol} APY too low: ${apy}% < ${this.minApy}% minimum`,
        riskLevel: 'LOW',
      };
    }

    // Medium risk requires 1.25x minimum APY
    if (riskLevel === 'medium') {
      const minRequired = this.minApy * 1.25;
      if (apy >= minRequired) {
        return {
          allowed: true,
          reason: `${protocol} medium-risk yield meets adjusted APY (${apy}% >= ${minRequired}%)`,
          riskLevel: 'MEDIUM',
        };
      }
      return {
        allowed: false,
        reason: `${protocol} medium-risk APY insufficient: ${apy}% < ${minRequired}%`,
        riskLevel: 'MEDIUM',
      };
    }

    // High risk requires high APY multiplier
    if (riskLevel === 'high') {
      const minRequired = this.minApy * this.highRiskMultiplier;
      if (apy >= minRequired) {
        return {
          allowed: true,
          reason: `${protocol} high-risk yield justified by premium APY (${apy}% >= ${minRequired}%)`,
          riskLevel: 'HIGH',
        };
      }
      return {
        allowed: false,
        reason: `${protocol} high-risk APY insufficient: ${apy}% < ${minRequired}% required for risk`,
        riskLevel: 'HIGH',
      };
    }

    return {
      allowed: false,
      reason: 'Unknown risk level',
      riskLevel: 'HIGH',
    };
  }

  /**
   * Check if protocol exposure exceeds limits
   */
  async checkExposure(protocol: string, currentExposure: number, additionalAmount: number): Promise<PolicyCheckResult> {
    const totalExposure = currentExposure + additionalAmount;
    const maxAllowed = this.maxExposurePercent;

    if (totalExposure > maxAllowed) {
      return {
        allowed: false,
        reason: `Protocol ${protocol} exposure would exceed ${maxAllowed}% limit`,
        riskLevel: 'HIGH',
      };
    }

    return {
      allowed: true,
      reason: `Exposure within limits: ${totalExposure.toFixed(2)}% <= ${maxAllowed}%`,
      riskLevel: 'LOW',
    };
  }

  /**
   * Validate agent operation
   */
  async checkAgentOperation(
    operation: string,
    params: Record<string, unknown>
  ): Promise<PolicyCheckResult> {
    // Whitelist of allowed operations
    const allowedOperations = [
      'swap',
      'supply',
      'withdraw',
      'transfer',
      'bridge',
      'stake',
      'unstake',
    ];

    if (!allowedOperations.includes(operation.toLowerCase())) {
      return {
        allowed: false,
        reason: `Operation ${operation} not in allowed list`,
        riskLevel: 'HIGH',
      };
    }

    // Check operation-specific limits
    switch (operation.toLowerCase()) {
      case 'transfer':
        return this.checkTransaction(
          params['to'] as string || '',
          params['amount'] as string || '0',
          params['data'] as string || '0x'
        );

      case 'swap':
      case 'supply':
      case 'stake':
        if (typeof params['apy'] === 'number' && typeof params['risk'] === 'string') {
          return this.checkYieldOpportunity(
            operation,
            params['apy'] as number,
            params['risk'] as 'low' | 'medium' | 'high'
          );
        }
        break;

      default:
        return { allowed: true, riskLevel: 'LOW' };
    }

    return { allowed: true, riskLevel: 'LOW' };
  }
}

let policyEnforcerInstance: OpenClawPolicyEnforcer | null = null;

export function getOpenClawPolicyEnforcer(): OpenClawPolicyEnforcer {
  if (!policyEnforcerInstance) {
    policyEnforcerInstance = new OpenClawPolicyEnforcer();
  }
  return policyEnforcerInstance;
}
