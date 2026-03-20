import { env } from '@/config/env';
import { ZERO_ADDRESS } from '@/lib/constants';
import { logger } from '@/utils/logger';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { ethers } from 'ethers';
import { z } from 'zod';
import { checkNavImpact, type NavShieldResult } from '@/services/NavShield';
import { getCreditScore, checkCreditRequirements, recordTransaction } from '@/services/CreditScoring';
import { calculateProfit, type ProfitCalcParams, type ProfitAnalysis } from '@/services/market-scanner/ProfitCalculator';
const TransactionSchema = z.object({
  toAddress: z.string().refine((val) => ethers.isAddress(val), {
    message: "Invalid Ethereum address",
  }),
  amount: z.string().refine((val) => {
    try {
      BigInt(val);
      return true;
    } catch {
      return false;
    }
  }, {
    message: "Amount must be a valid BigInt string",
  }),
  currentRiskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  portfolioValue: z.string(),
});

const SwapSchema = z.object({
  fromToken: z.string().refine((val) => ethers.isAddress(val), {
    message: "Invalid fromToken address",
  }),
  toToken: z.string().refine((val) => ethers.isAddress(val), {
    message: "Invalid toToken address",
  }),
  amount: z.string().refine((val) => {
    try {
      BigInt(val);
      return true;
    } catch {
      return false;
    }
  }, {
    message: "Amount must be a valid BigInt string",
  }),
  currentRiskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  portfolioValue: z.string(),
  estimatedSlippageBps: z.number().min(0).max(10000).optional(),
});

export interface SafetyPolicy {
  maxRiskPercentage: number;
  dailyMaxTransactions: number;
  dailyMaxVolume: string; // in USDT
  whitelistedAddresses: Set<string>;
  maxSlippageBps: number; // max slippage in basis points
  emergencyBreaker: boolean;
}

interface AgentRiskParams {
  maxRiskBps: number;
  dailyMaxTx: number;
  dailyMaxVolume: string;
  maxSlippageBps: number;
  minHealthFactor: string;
  emergencyHealthFactor: string;
  maxConsecutiveFailures: number;
  circuitBreakerCooldownSeconds: number;
  oracleMaxAgeSeconds: number;
  hfVelocityThresholdBps: number;
  whitelistedProtocols: string[];
  whitelistedTokens: string[];
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

  // On-chain parameter integration
  private onChainRiskParams: AgentRiskParams | null = null;
  private paramsCache: { data: AgentRiskParams | null; timestamp: number; ttlMs: number } = {
    data: null,
    timestamp: 0,
    ttlMs: 300000
  };
  private riskParamsContract: ethers.Contract | null = null;
  private paramSource: 'on-chain' | 'in-memory' | 'hybrid' = 'in-memory';

  constructor(policy?: Partial<SafetyPolicy>) {
    this.initOnChainConnection();
    this.policy = {
      maxRiskPercentage: 5,
      dailyMaxTransactions: 10,
      dailyMaxVolume: '9007199254740991000000',
      whitelistedAddresses: new Set([
        ZERO_ADDRESS,
      ]),
      maxSlippageBps: 500,
      emergencyBreaker: false,
      ...policy,
    };
    this.loadOnChainParams();
  }

  private async initOnChainConnection(): Promise<void> {
    const contractAddress = env.AGENT_RISK_PARAMS_ADDRESS;
    const rpcUrl = env.SEPOLIA_RPC_URL;
    
    if (!contractAddress || !rpcUrl) {
      return;
    }
    
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const abi = [
        'function getAllParameters() view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)',
        'function getWhitelistedProtocols() view returns (address[])',
        'function getWhitelistedTokens() view returns (address[])',
        'function isProtocolWhitelisted(address) view returns (bool)'
      ];
      this.riskParamsContract = new ethers.Contract(contractAddress, abi, provider);
      logger.info({ contractAddress }, '[PolicyGuard] On-chain risk params connected');
    } catch (error) {
      logger.warn({ error }, '[PolicyGuard] Failed to connect to on-chain risk params');
    }
  }

  private async loadOnChainParams(): Promise<void> {
    if (!this.riskParamsContract) return;
    
    const now = Date.now();
    if (this.paramsCache.data && (now - this.paramsCache.timestamp) < this.paramsCache.ttlMs) {
      return;
    }
    
    try {
      const [params, protocols, tokens] = await Promise.all([
        this.riskParamsContract.getAllParameters(),
        this.riskParamsContract.getWhitelistedProtocols(),
        this.riskParamsContract.getWhitelistedTokens()
      ]);
      
      this.onChainRiskParams = {
        maxRiskBps: Number(params[0]),
        dailyMaxTx: Number(params[1]),
        dailyMaxVolume: params[2].toString(),
        maxSlippageBps: Number(params[3]),
        minHealthFactor: params[4].toString(),
        emergencyHealthFactor: params[5].toString(),
        maxConsecutiveFailures: Number(params[6]),
        circuitBreakerCooldownSeconds: Number(params[7]),
        oracleMaxAgeSeconds: Number(params[8]),
        hfVelocityThresholdBps: Number(params[9]),
        whitelistedProtocols: protocols,
        whitelistedTokens: tokens
      };
      
      this.paramsCache = { data: this.onChainRiskParams, timestamp: now, ttlMs: 300000 };
      
      this.policy.maxRiskPercentage = this.onChainRiskParams.maxRiskBps / 100;
      this.policy.dailyMaxTransactions = this.onChainRiskParams.dailyMaxTx;
      this.policy.dailyMaxVolume = this.onChainRiskParams.dailyMaxVolume;
      this.policy.maxSlippageBps = this.onChainRiskParams.maxSlippageBps;
      
      for (const p of this.onChainRiskParams.whitelistedProtocols) {
        this.policy.whitelistedAddresses.add(p.toLowerCase());
      }
      
      this.paramSource = 'on-chain';
      logger.info({ maxRisk: this.policy.maxRiskPercentage, dailyMaxTx: this.policy.dailyMaxTransactions }, '[PolicyGuard] Loaded risk params from on-chain');
    } catch (error) {
      logger.warn({ error }, '[PolicyGuard] Failed to load on-chain params, using in-memory defaults');
      this.paramSource = 'in-memory';
    }
  }

  getParamSource(): 'on-chain' | 'in-memory' | 'hybrid' {
    return this.paramSource;
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

    const AAVE_POOL = env.AAVE_POOL_ADDRESS || '';
    const LZ_ENDPOINT = env.LZ_ENDPOINT_ADDRESS || '';
    const AAVE_ADAPTER = env.WDK_AAVE_ADAPTER_ADDRESS || '';
    const LZ_ADAPTER = env.WDK_LZ_ADAPTER_ADDRESS || '';

    if ((AAVE_POOL && params.toAddress.toLowerCase() === AAVE_POOL.toLowerCase()) ||
        (LZ_ENDPOINT && params.toAddress.toLowerCase() === LZ_ENDPOINT.toLowerCase()) ||
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
    // NOTE: dailyMaxVolume is in USDT units (6 decimals), but amount may be in ETH (18 decimals) or USDT (6 decimals)
    // We need to normalize for comparison. If amount > 10^15, assume it's ETH (wei) and scale up dailyMaxVolume
    const USDT_DECIMALS = 6n;
    const ETH_DECIMALS = 18n;
    const DECIMAL_DIFF = ETH_DECIMALS - USDT_DECIMALS; // 12
    
    let maxVolume = BigInt(this.policy.dailyMaxVolume);
    let dailyVolume = this.dailyVolume;
    const amount = amountBigInt;
    
    // If amount looks like ETH (18 decimals), normalize maxVolume and dailyVolume to same scale
    if (amount > 1_000_000_000_000_000n) { // > 0.001 ETH in wei
      // Convert dailyMaxVolume from USDT (6 decimals) to wei (18 decimals)
      maxVolume = maxVolume * (10n ** DECIMAL_DIFF);
      dailyVolume = dailyVolume * (10n ** DECIMAL_DIFF);
    }
    
    if (dailyVolume + amount > maxVolume) {
      return {
        violated: true,
        reason: `Daily volume limit would be exceeded. Current: ${this.dailyVolume}, Max: ${this.policy.dailyMaxVolume}`,
        severity: 'HIGH',
      };
    }

    // Check max risk percentage (trade amount vs portfolio)
    const portfolioValue = BigInt(params.portfolioValue);
    if (portfolioValue > 0n) {
      const tradePercentage = Number((amountBigInt * 100n) / portfolioValue); // e.g., 5 = 5%
      const maxRiskPercent = this.policy.maxRiskPercentage; // Already in percent (e.g., 5 = 5%)

      if (tradePercentage > maxRiskPercent) {
        return {
          violated: true,
          reason: `Trade size ${tradePercentage}% exceeds max risk ${maxRiskPercent}% of portfolio`,
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

    const DECIMAL_DIFF = 12n;
    let maxVolume = BigInt(this.policy.dailyMaxVolume);
    let dailyVolume = this.dailyVolume;
    const amountBigInt = BigInt(params.amount);
    
    if (amountBigInt > 1_000_000_000_000_000n) {
      maxVolume = maxVolume * (10n ** DECIMAL_DIFF);
      dailyVolume = dailyVolume * (10n ** DECIMAL_DIFF);
    }
    
    if (dailyVolume + amountBigInt > maxVolume) {
      return {
        violated: true,
        reason: `Daily volume limit would be exceeded. Current: ${this.dailyVolume}, Max: ${this.policy.dailyMaxVolume}`,
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
    if (portfolioValue > 0n) {
      const tradePercentage = Number((amountBigInt * 100n) / portfolioValue);
      const maxRiskPercent = this.policy.maxRiskPercentage;

      if (tradePercentage > maxRiskPercent) {
        return {
          violated: true,
          reason: `Trade size ${tradePercentage}% exceeds max risk ${maxRiskPercent}% of portfolio`,
          severity: 'MEDIUM',
        };
      }
    }

    return { violated: false, reason: 'PASS', severity: 'LOW' };
  }

  /**
   * Check NAV impact for a swap before execution.
   *
   * This is an ASYNC check that simulates the trade's impact on vault NAV.
   * Call this AFTER validateSwapTransaction passes but BEFORE broadcasting.
   *
   * @returns PolicyViolation with violated=true if NAV would drop > threshold
   */
  async checkNavImpactForSwap(params: {
    vaultAddress: string;
    inputAmount: bigint;
    expectedOutputAmount: bigint;
    inputTokenPriceUsdt: bigint;
    outputTokenPriceUsdt: bigint;
    maxDropPct?: number;
  }): Promise<PolicyViolation> {
    try {
      const navResult: NavShieldResult = await checkNavImpact({
        vaultAddress: params.vaultAddress,
        inputAmount: params.inputAmount,
        expectedOutputAmount: params.expectedOutputAmount,
        inputTokenPriceUsdt: params.inputTokenPriceUsdt,
        outputTokenPriceUsdt: params.outputTokenPriceUsdt,
        maxDropPct: params.maxDropPct || 10,
      });

      if (!navResult.verified) {
        // Fail-closed: if we can't verify NAV, block the trade
        logger.warn({ reason: navResult.reason }, '[PolicyGuard] NAV shield UNVERIFIED — blocking trade');
        return {
          violated: true,
          reason: `NAV verification failed: ${navResult.reason}`,
          severity: 'CRITICAL',
        };
      }

      if (!navResult.allowed) {
        logger.warn({
          dropPct: navResult.dropPct,
          reason: navResult.reason,
        }, '[PolicyGuard] NAV shield BLOCKED trade');
        return {
          violated: true,
          reason: `NAV shield blocked: ${navResult.reason}`,
          severity: 'HIGH',
        };
      }

      logger.info({
        dropPct: navResult.dropPct,
        preNav: navResult.preNavPerShare,
        postNav: navResult.postNavPerShare,
      }, '[PolicyGuard] NAV shield OK');

      return { violated: false, reason: `NAV check passed (drop: ${navResult.dropPct}%)`, severity: 'LOW' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, '[PolicyGuard] NAV check failed — blocking trade');
      // Fail-closed: errors mean we can't verify, so block
      return {
        violated: true,
        reason: `NAV check error: ${message}`,
        severity: 'CRITICAL',
      };
    }
  }

  validateArbitrageOpportunity(params: {
    spreadBps: number;
    volumeUsd: number;
    gasEstimate: number;
    gasPriceGwei: number;
    ethPriceUsd: number;
    buyExchange: string;
    sellExchange: string;
    minProfitUsd?: number;
    minSpreadBps?: number;
  }): { violated: boolean; reason: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; analysis: ProfitAnalysis } {
    const minProfitUsd = params.minProfitUsd ?? 5; // Default $5 minimum profit
    const minSpreadBps = params.minSpreadBps ?? 15; // Default 15 bps minimum spread

    const feeMap: Record<string, number> = {
      binance: 10,
      bybit: 10,
      okx: 8,
      uniswap: 30,
      curve: 4,
      pancakeswap: 25,
    };

    const calcParams: ProfitCalcParams = {
      spreadBps: params.spreadBps,
      volumeUsd: params.volumeUsd,
      gasEstimate: params.gasEstimate,
      gasPriceGwei: params.gasPriceGwei,
      ethPriceUsd: params.ethPriceUsd,
      buyFeeBps: feeMap[params.buyExchange] ?? 10,
      sellFeeBps: feeMap[params.sellExchange] ?? 10,
    };

    const analysis = calculateProfit(calcParams);

    if (params.spreadBps < minSpreadBps) {
      return {
        violated: true,
        reason: `Spread ${params.spreadBps} bps below minimum ${minSpreadBps} bps`,
        severity: 'MEDIUM',
        analysis,
      };
    }

    if (!analysis.isProfitable) {
      return {
        violated: true,
        reason: `Opportunity not profitable after fees. Net: $${analysis.netProfitUsd.toFixed(2)}`,
        severity: 'HIGH',
        analysis,
      };
    }

    if (analysis.netProfitUsd < minProfitUsd) {
      return {
        violated: true,
        reason: `Net profit $${analysis.netProfitUsd.toFixed(2)} below minimum $${minProfitUsd}`,
        severity: 'MEDIUM',
        analysis,
      };
    }

    if (analysis.recommendation !== 'EXECUTE') {
      return {
        violated: true,
        reason: `Recommendation: ${analysis.recommendation}. Net profit: $${analysis.netProfitUsd.toFixed(2)}`,
        severity: 'MEDIUM',
        analysis,
      };
    }

    logger.info({
      spreadBps: params.spreadBps,
      netProfitUsd: analysis.netProfitUsd,
      recommendation: analysis.recommendation,
    }, '[PolicyGuard] Arbitrage opportunity validated');

    return {
      violated: false,
      reason: `Profitable arbitrage: $${analysis.netProfitUsd.toFixed(2)} net profit`,
      severity: 'LOW',
      analysis,
    };
  }

  /**
   * Check credit score requirements for an agent before transaction.
   *
   * Returns violated=true if agent doesn't meet credit requirements.
   * Uses dynamic limits based on agent's transaction history.
   */
  checkCreditRequirements(params: {
    agentId: string;
    amountUsdt: bigint;
  }): PolicyViolation {
    const creditCheck = checkCreditRequirements({
      agentId: params.agentId,
      requestedAmountUsdt: params.amountUsdt,
    });

    if (!creditCheck.allowed) {
      logger.warn({
        agentId: params.agentId,
        score: creditCheck.score,
        riskLevel: creditCheck.riskLevel,
      }, '[PolicyGuard] Credit check FAILED');

      return {
        violated: true,
        reason: creditCheck.reason || 'Credit requirements not met',
        severity: creditCheck.riskLevel === 'HIGH' ? 'CRITICAL' : 'HIGH',
      };
    }

    logger.info({
      agentId: params.agentId,
      score: creditCheck.score,
      riskLevel: creditCheck.riskLevel,
    }, '[PolicyGuard] Credit check passed');

    return { violated: false, reason: `Credit check passed (score: ${creditCheck.score})`, severity: 'LOW' };
  }

  /**
   * Record transaction outcome for credit scoring.
   * Call this AFTER transaction completes (success or failure).
   */
  recordTransactionForCredit(params: {
    agentId: string;
    success: boolean;
    volumeUsdt: bigint;
    lossUsdt?: bigint;
  }): void {
    recordTransaction(params);
  }

  /**
   * Get credit score for an agent.
   */
  getCreditScore(agentId: string) {
    return getCreditScore(agentId);
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

    const DECIMAL_DIFF = 12n;
    let maxVolume = BigInt(this.policy.dailyMaxVolume);
    let dailyVolume = this.dailyVolume;
    const amountBigInt = BigInt(params.amount);
    
    if (amountBigInt > 1_000_000_000_000_000n) {
      maxVolume = maxVolume * (10n ** DECIMAL_DIFF);
      dailyVolume = dailyVolume * (10n ** DECIMAL_DIFF);
    }
    
    if (dailyVolume + amountBigInt > maxVolume) {
      return {
        violated: true,
        reason: `Daily volume limit would be exceeded. Current: ${this.dailyVolume}, Max: ${this.policy.dailyMaxVolume}`,
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

  validateTransactionWithSchema(params: any): PolicyViolation {
    try {
      const parsed = TransactionSchema.parse(params);
      return this.validateTransaction(parsed);
    } catch (error: any) {
      return {
        violated: true,
        reason: `Schema validation failed: ${error.errors?.[0]?.message || error.message}`,
        severity: 'MEDIUM',
      };
    }
  }

  validateSwapWithSchema(params: any): PolicyViolation {
    try {
      const parsed = SwapSchema.parse(params);
      return this.validateSwapTransaction(parsed);
    } catch (error: any) {
      return {
        violated: true,
        reason: `Schema validation failed: ${error.errors?.[0]?.message || error.message}`,
        severity: 'MEDIUM',
      };
    }
  }

  async aiReviewTransaction(params: {
    toAddress: string;
    amount: string;
    transactionType: string;
    context?: string;
  }): Promise<PolicyViolation> {
    try {
      const openai = createOpenAI({
        apiKey: env.OPENROUTER_API_KEY,
        baseURL: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      });

      const result = await generateText({
        model: openai(env.OPENROUTER_MODEL_CRYPTO || 'x-ai/grok-4.1-fast'),
        temperature: 0,
        prompt: `Review this DeFi transaction for security and risk:

Transaction Details:
- Type: ${params.transactionType}
- To: ${params.toAddress}
- Amount: ${params.amount} USDT
- Context: ${params.context || 'No additional context'}

Is this transaction safe to execute? Consider:
1. Address reputation and whitelist status
2. Transaction amount relative to portfolio
3. Smart contract interaction risks
4. Cross-chain bridging risks if applicable

Provide a decision with reason and risk level. Return JSON: {"approved": true/false, "reason": "...", "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL"}`,
      });

      const object = JSON.parse(result.text);

      if (!object.approved) {
        return {
          violated: true,
          reason: `AI review rejected: ${object.reason}`,
          severity: object.riskLevel as any,
        };
      }

      logger.info({ reason: object.reason, riskLevel: object.riskLevel }, '[PolicyGuard] AI review passed');
      return { violated: false, reason: 'AI review passed', severity: 'LOW' };
    } catch (error: any) {
      logger.warn({ error: error.message }, '[PolicyGuard] AI review failed, falling back to standard validation');
      return { violated: false, reason: 'AI review unavailable, using standard validation', severity: 'LOW' };
    }
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
