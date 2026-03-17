import { ethers } from 'ethers';
import { ZERO_ADDRESS } from '@/lib/constants';
import { logger } from '@/utils/logger';

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
  
  // Per-user policies for multi-wallet support
  private userPolicies: Map<string, {
    whitelistedAddresses: Set<string>;
    dailyTransactionCount: number;
    dailyVolume: bigint;
    lastResetDate: Date;
  }> = new Map();

  constructor(policy?: Partial<SafetyPolicy>) {
    this.policy = {
      maxRiskPercentage: 5,
      dailyMaxTransactions: 10,
      dailyMaxVolume: '9007199254740991000000', // Very high limit (BigInt safe limit) for testing
      whitelistedAddresses: new Set([
        ZERO_ADDRESS,
      ]),
      maxSlippageBps: 500,
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
    logger.warn('[PolicyGuard] EMERGENCY BREAKER ACTIVATED - ALL ACTIONS BLOCKED');
  }

  /**
   * Deactivate emergency breaker
   */
  deactivateEmergency(): void {
    this.policy.emergencyBreaker = false;
    logger.info('[PolicyGuard] Emergency breaker deactivated');
  }

  /**
   * Add address to whitelist
   */
  addToWhitelist(address: string): void {
    this.policy.whitelistedAddresses.add(address.toLowerCase());
    logger.info({ address }, '[PolicyGuard] Added to whitelist');
  }

  /**
   * Add address to user's whitelist (for multi-wallet support)
   */
  addToUserWhitelist(userWallet: string, address: string): void {
    let userPolicy = this.userPolicies.get(userWallet.toLowerCase());
    if (!userPolicy) {
      userPolicy = {
        whitelistedAddresses: new Set([ZERO_ADDRESS]),
        dailyTransactionCount: 0,
        dailyVolume: 0n,
        lastResetDate: new Date()
      };
      this.userPolicies.set(userWallet.toLowerCase(), userPolicy);
    }
    userPolicy.whitelistedAddresses.add(address.toLowerCase());
    logger.info({ userWallet, address }, '[PolicyGuard] Added to user whitelist');
  }

  /**
   * Get user's whitelist
   */
  getUserWhitelist(userWallet: string): string[] {
    const userPolicy = this.userPolicies.get(userWallet.toLowerCase());
    return userPolicy ? Array.from(userPolicy.whitelistedAddresses) : [];
  }

  /**
   * Check if address is whitelisted for user
   */
  isUserWhitelisted(userWallet: string, address: string): boolean {
    const userPolicy = this.userPolicies.get(userWallet.toLowerCase());
    if (userPolicy) {
      return userPolicy.whitelistedAddresses.has(address.toLowerCase());
    }
    return false;
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
      logger.info('[PolicyGuard] Daily counters reset');
    }
  }

  /**
   * Validate general outbound transaction against risk policy
   */
  validateTransaction(params: {
    toAddress: string;
    amount: string; // in smallest units
    currentRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    portfolioValue: string; // in smallest units
  }): PolicyViolation {
    this.resetDailyCountersIfNeeded();

    // Check emergency breaker first
    if (this.policy.emergencyBreaker) {
      return {
        violated: true,
        reason: 'Emergency breaker is active - all transactions blocked',
        severity: 'CRITICAL',
      };
    }

    const AAVE_POOL = '0x6807dc923806fE8Fd134338EABCA509979a7e0cB';
    const LZ_ENDPOINT = '0x3c2269811836af69497E5F486A85D7316753cf62';
    const AAVE_ADAPTER = process.env.WDK_AAVE_ADAPTER_ADDRESS || '';
    const LZ_ADAPTER = process.env.WDK_LZ_ADAPTER_ADDRESS || '';

    // Auto-whitelist core infrastructure
    if (params.toAddress.toLowerCase() === AAVE_POOL.toLowerCase() || 
        params.toAddress.toLowerCase() === LZ_ENDPOINT.toLowerCase() ||
        (AAVE_ADAPTER && params.toAddress.toLowerCase() === AAVE_ADAPTER.toLowerCase()) ||
        (LZ_ADAPTER && params.toAddress.toLowerCase() === LZ_ADAPTER.toLowerCase())) {
      logger.info({ address: params.toAddress }, '[PolicyGuard] Allowing core infrastructure transaction');
    } else {
      if (BigInt(params.amount) > 0n && !this.policy.whitelistedAddresses.has(params.toAddress.toLowerCase())) {
         return {
           violated: true,
           reason: `Recipient address ${params.toAddress} is NOT whitelisted for outbound volume.`,
           severity: 'CRITICAL'
         }
      }
    }

    // Define amountBigInt for use in volume and risk checks
    const amountBigInt = BigInt(params.amount);

    // Check risk level
    if (params.currentRiskLevel === 'HIGH') {
      return {
        violated: true,
        reason: 'Current portfolio risk is HIGH - cannot execute transaction',
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
    const maxVolume = BigInt(this.policy.dailyMaxVolume);
    if (this.dailyVolume + amountBigInt > maxVolume) {
      return {
        violated: true,
        reason: `Daily volume limit would be exceeded. Current: ${this.dailyVolume}, Max: ${maxVolume}`,
        severity: 'HIGH',
      };
    }

    // Check max risk percentage (trade amount vs portfolio)
    const portfolioValue = BigInt(params.portfolioValue);
    if (portfolioValue > 0n) {
      const tradePercentage = (amountBigInt * 100n) / portfolioValue;
      const maxRiskBps = BigInt(this.policy.maxRiskPercentage * 100); // Convert to basis points
      
      if (tradePercentage > maxRiskBps / 100n) {
        return {
          violated: true,
          reason: `Trade size ${tradePercentage}% exceeds max risk ${this.policy.maxRiskPercentage}% of portfolio`,
          severity: 'MEDIUM',
        };
      }
    }

    return { violated: false, reason: 'PASS', severity: 'LOW' };
  }

  /**
   * Validate swap transaction against risk policy
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
  recordTransaction(amount: string, toAddress?: string): void {
    this.resetDailyCountersIfNeeded();
    this.dailyTransactionCount++;
    this.dailyVolume += BigInt(amount);
    if (toAddress && !this.policy.whitelistedAddresses.has(toAddress)) {
      this.policy.whitelistedAddresses.add(toAddress); // Auto-whitelist if the first tx passed other checks
    }
    logger.info(
      { count: this.dailyTransactionCount, limit: this.policy.dailyMaxTransactions },
      '[PolicyGuard] Transaction recorded'
    );
  }

  /**
   * Update policy parameters
   */
  updatePolicy(updates: Partial<SafetyPolicy>): void {
    this.policy = { ...this.policy, ...updates };
    logger.info({ policy: this.policy }, '[PolicyGuard] Policy updated');
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
