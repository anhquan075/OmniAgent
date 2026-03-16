import { ethers } from 'ethers';

export interface SafetyPolicy {
  maxRiskPercentage: number;
  dailyMaxTransactions: number;
  dailyMaxVolume: string; // in USDT
  whitelistedAddresses: Set<string>;
  maxSlippageBps: number; // max slippage in basis points
  emergencyBreaker: boolean;
}

export interface PolicyViolation {
  violated: boolean;
  reason: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export class PolicyGuard {
  private policy: SafetyPolicy;
  private dailyTransactionCount: number = 0;
  private dailyVolume: bigint = 0n;
  private lastResetDate: Date = new Date();

  constructor(policy?: Partial<SafetyPolicy>) {
    // Default conservative policy
    this.policy = {
      maxRiskPercentage: 5, // Max 5% portfolio risk per trade
      dailyMaxTransactions: 10,
      dailyMaxVolume: ethers.parseUnits('100000', 6).toString(), // 100k USDT
      whitelistedAddresses: new Set([
        '0x0000000000000000000000000000000000000000', // NULL address for testing
      ]),
      maxSlippageBps: 500, // 5% max slippage
      emergencyBreaker: false,
      ...policy,
    };
  }

  /**
   * Check if emergency breaker is active
   */
  isEmergencyActive(): boolean {
    return this.policy.emergencyBreaker;
  }

  /**
   * Activate emergency breaker (all actions blocked)
   */
  activateEmergency(): void {
    this.policy.emergencyBreaker = true;
    console.warn('[PolicyGuard] 🚨 EMERGENCY BREAKER ACTIVATED - ALL ACTIONS BLOCKED');
  }

  /**
   * Deactivate emergency breaker
   */
  deactivateEmergency(): void {
    this.policy.emergencyBreaker = false;
    console.log('[PolicyGuard] ✅ Emergency breaker deactivated');
  }

  /**
   * Reset daily counters if date has changed
   */
  private resetDailyCountersIfNeeded(): void {
    const now = new Date();
    if (now.getDate() !== this.lastResetDate.getDate()) {
      this.dailyTransactionCount = 0;
      this.dailyVolume = 0n;
      this.lastResetDate = now;
      console.log('[PolicyGuard] Daily counters reset');
    }
  }

  /**
   * Validate transaction against risk policy
   */
  validateSwapTransaction(params: {
    fromToken: string;
    toToken: string;
    amount: string; // in smallest units
    currentRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    portfolioValue: string; // in smallest units
    estimatedSlippageBps?: number;
  }): PolicyViolation {
    this.resetDailyCountersIfNeeded();

    // Check emergency breaker first
    if (this.policy.emergencyBreaker) {
      return {
        violated: true,
        reason: 'Emergency breaker is active - all swaps blocked',
        severity: 'CRITICAL',
      };
    }

    // Check risk level
    if (params.currentRiskLevel === 'HIGH') {
      return {
        violated: true,
        reason: 'Current portfolio risk is HIGH - cannot execute swap',
        severity: 'HIGH',
      };
    }

    // Check daily transaction limit
    if (this.dailyTransactionCount >= this.policy.dailyMaxTransactions) {
      return {
        violated: true,
        reason: `Daily transaction limit (${this.policy.dailyMaxTransactions}) reached`,
        severity: 'HIGH',
      };
    }

    // Check daily volume limit
    const amountBigInt = BigInt(params.amount);
    const maxVolume = BigInt(this.policy.dailyMaxVolume);
    if (this.dailyVolume + amountBigInt > maxVolume) {
      return {
        violated: true,
        reason: `Daily volume limit would be exceeded. Current: ${this.dailyVolume}, Max: ${maxVolume}`,
        severity: 'HIGH',
      };
    }

    // Check slippage tolerance
    const slippage = params.estimatedSlippageBps || 0;
    if (slippage > this.policy.maxSlippageBps) {
      return {
        violated: true,
        reason: `Estimated slippage ${slippage} bps exceeds max ${this.policy.maxSlippageBps} bps`,
        severity: 'MEDIUM',
      };
    }

    // Check max risk percentage (trade amount vs portfolio)
    const portfolioValue = BigInt(params.portfolioValue);
    const tradePercentage = (amountBigInt * 100n) / portfolioValue;
    const maxRiskBps = BigInt(this.policy.maxRiskPercentage * 100); // Convert to basis points
    
    if (tradePercentage > maxRiskBps / 100n) {
      return {
        violated: true,
        reason: `Trade size ${tradePercentage}% exceeds max risk ${this.policy.maxRiskPercentage}% of portfolio`,
        severity: 'MEDIUM',
      };
    }

    return { violated: false, reason: 'PASS', severity: 'LOW' };
  }

  /**
   * Validate bridge transaction
   */
  validateBridgeTransaction(params: {
    fromChain: string;
    toChain: string;
    amount: string; // in smallest units
    currentRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    portfolioValue: string;
  }): PolicyViolation {
    this.resetDailyCountersIfNeeded();

    if (this.policy.emergencyBreaker) {
      return {
        violated: true,
        reason: 'Emergency breaker is active - all bridges blocked',
        severity: 'CRITICAL',
      };
    }

    if (params.currentRiskLevel === 'HIGH') {
      return {
        violated: true,
        reason: 'Current portfolio risk is HIGH - cannot execute bridge',
        severity: 'HIGH',
      };
    }

    if (this.dailyTransactionCount >= this.policy.dailyMaxTransactions) {
      return {
        violated: true,
        reason: `Daily transaction limit (${this.policy.dailyMaxTransactions}) reached`,
        severity: 'HIGH',
      };
    }

    const amountBigInt = BigInt(params.amount);
    const maxVolume = BigInt(this.policy.dailyMaxVolume);
    if (this.dailyVolume + amountBigInt > maxVolume) {
      return {
        violated: true,
        reason: `Daily volume limit would be exceeded`,
        severity: 'HIGH',
      };
    }

    return { violated: false, reason: 'PASS', severity: 'LOW' };
  }

  /**
   * Record successful transaction (update daily counters)
   */
  recordTransaction(amount: string): void {
    this.resetDailyCountersIfNeeded();
    this.dailyTransactionCount++;
    this.dailyVolume += BigInt(amount);
    console.log(
      `[PolicyGuard] Transaction recorded. Daily count: ${this.dailyTransactionCount}/${this.policy.dailyMaxTransactions}`
    );
  }

  /**
   * Update policy parameters
   */
  updatePolicy(updates: Partial<SafetyPolicy>): void {
    this.policy = { ...this.policy, ...updates };
    console.log('[PolicyGuard] Policy updated', this.policy);
  }

  /**
   * Get current policy state
   */
  getPolicy(): SafetyPolicy {
    return { ...this.policy };
  }

  /**
   * Get daily usage stats
   */
  getDailyStats(): {
    transactionCount: number;
    transactionLimit: number;
    volumeUsed: string;
    volumeLimit: string;
  } {
    this.resetDailyCountersIfNeeded();
    return {
      transactionCount: this.dailyTransactionCount,
      transactionLimit: this.policy.dailyMaxTransactions,
      volumeUsed: this.dailyVolume.toString(),
      volumeLimit: this.policy.dailyMaxVolume,
    };
  }
}

/**
 * Global PolicyGuard instance
 */
let globalPolicyGuard: PolicyGuard | null = null;

export function getPolicyGuard(): PolicyGuard {
  if (!globalPolicyGuard) {
    globalPolicyGuard = new PolicyGuard();
  }
  return globalPolicyGuard;
}

export function setPolicyGuard(guard: PolicyGuard): void {
  globalPolicyGuard = guard;
}
