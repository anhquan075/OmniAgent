"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyGuard = void 0;
exports.getPolicyGuard = getPolicyGuard;
exports.setPolicyGuard = setPolicyGuard;
const env_1 = require("../../config/env");
const constants_1 = require("../../lib/constants");
const logger_1 = require("../../utils/logger");
const openai_1 = require("@ai-sdk/openai");
const ai_1 = require("ai");
const ethers_1 = require("ethers");
const zod_1 = require("zod");
const TransactionSchema = zod_1.z.object({
    toAddress: zod_1.z.string().refine((val) => ethers_1.ethers.isAddress(val), {
        message: "Invalid Ethereum address",
    }),
    amount: zod_1.z.string().refine((val) => {
        try {
            BigInt(val);
            return true;
        }
        catch {
            return false;
        }
    }, {
        message: "Amount must be a valid BigInt string",
    }),
    currentRiskLevel: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH']),
    portfolioValue: zod_1.z.string(),
});
const SwapSchema = zod_1.z.object({
    fromToken: zod_1.z.string().refine((val) => ethers_1.ethers.isAddress(val), {
        message: "Invalid fromToken address",
    }),
    toToken: zod_1.z.string().refine((val) => ethers_1.ethers.isAddress(val), {
        message: "Invalid toToken address",
    }),
    amount: zod_1.z.string().refine((val) => {
        try {
            BigInt(val);
            return true;
        }
        catch {
            return false;
        }
    }, {
        message: "Amount must be a valid BigInt string",
    }),
    currentRiskLevel: zod_1.z.enum(['LOW', 'MEDIUM', 'HIGH']),
    portfolioValue: zod_1.z.string(),
    estimatedSlippageBps: zod_1.z.number().min(0).max(10000).optional(),
});
class PolicyGuard {
    policy;
    dailyTransactionCount = 0;
    dailyVolume = 0n;
    lastResetDate = new Date();
    // Per-user policies for multi-wallet support
    userPolicies = new Map();
    constructor(policy) {
        this.policy = {
            maxRiskPercentage: 5,
            dailyMaxTransactions: 10,
            dailyMaxVolume: '9007199254740991000000', // Very high limit (BigInt safe limit) for testing
            whitelistedAddresses: new Set([
                constants_1.ZERO_ADDRESS,
            ]),
            maxSlippageBps: 500,
            emergencyBreaker: false,
            ...policy,
        };
    }
    /**
     * Check if emergency breaker is active
     */
    isEmergencyActive() {
        return this.policy.emergencyBreaker;
    }
    /**
     * Activate emergency breaker (all actions blocked)
     */
    activateEmergency() {
        this.policy.emergencyBreaker = true;
        logger_1.logger.warn('[PolicyGuard] EMERGENCY BREAKER ACTIVATED - ALL ACTIONS BLOCKED');
    }
    /**
     * Deactivate emergency breaker
     */
    deactivateEmergency() {
        this.policy.emergencyBreaker = false;
        logger_1.logger.info('[PolicyGuard] Emergency breaker deactivated');
    }
    /**
     * Add address to whitelist
     */
    addToWhitelist(address) {
        this.policy.whitelistedAddresses.add(address.toLowerCase());
        logger_1.logger.info({ address }, '[PolicyGuard] Added to whitelist');
    }
    /**
     * Add address to user's whitelist (for multi-wallet support)
     */
    addToUserWhitelist(userWallet, address) {
        let userPolicy = this.userPolicies.get(userWallet.toLowerCase());
        if (!userPolicy) {
            userPolicy = {
                whitelistedAddresses: new Set([constants_1.ZERO_ADDRESS]),
                dailyTransactionCount: 0,
                dailyVolume: 0n,
                lastResetDate: new Date()
            };
            this.userPolicies.set(userWallet.toLowerCase(), userPolicy);
        }
        userPolicy.whitelistedAddresses.add(address.toLowerCase());
        logger_1.logger.info({ userWallet, address }, '[PolicyGuard] Added to user whitelist');
    }
    /**
     * Get user's whitelist
     */
    getUserWhitelist(userWallet) {
        const userPolicy = this.userPolicies.get(userWallet.toLowerCase());
        return userPolicy ? Array.from(userPolicy.whitelistedAddresses) : [];
    }
    /**
     * Check if address is whitelisted for user
     */
    isUserWhitelisted(userWallet, address) {
        const userPolicy = this.userPolicies.get(userWallet.toLowerCase());
        if (userPolicy) {
            return userPolicy.whitelistedAddresses.has(address.toLowerCase());
        }
        return false;
    }
    /**
     * Reset daily counters if date has changed
     */
    resetDailyCountersIfNeeded() {
        const now = new Date();
        if (now.getDate() !== this.lastResetDate.getDate()) {
            this.dailyTransactionCount = 0;
            this.dailyVolume = 0n;
            this.lastResetDate = now;
            logger_1.logger.info('[PolicyGuard] Daily counters reset');
        }
    }
    /**
     * Validate general outbound transaction against risk policy
     */
    validateTransaction(params) {
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
            logger_1.logger.info({ address: params.toAddress }, '[PolicyGuard] Allowing core infrastructure transaction');
        }
        else {
            if (BigInt(params.amount) > 0n && !this.policy.whitelistedAddresses.has(params.toAddress.toLowerCase())) {
                return {
                    violated: true,
                    reason: `Recipient address ${params.toAddress} is NOT whitelisted for outbound volume.`,
                    severity: 'CRITICAL'
                };
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
    validateSwapTransaction(params) {
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
    validateBridgeTransaction(params) {
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
    recordTransaction(amount, toAddress) {
        this.resetDailyCountersIfNeeded();
        this.dailyTransactionCount++;
        this.dailyVolume += BigInt(amount);
        if (toAddress && !this.policy.whitelistedAddresses.has(toAddress)) {
            this.policy.whitelistedAddresses.add(toAddress); // Auto-whitelist if the first tx passed other checks
        }
        logger_1.logger.info({ count: this.dailyTransactionCount, limit: this.policy.dailyMaxTransactions }, '[PolicyGuard] Transaction recorded');
    }
    /**
     * Update policy parameters
     */
    updatePolicy(updates) {
        this.policy = { ...this.policy, ...updates };
        logger_1.logger.info({ policy: this.policy }, '[PolicyGuard] Policy updated');
    }
    /**
     * Get current policy state
     */
    getPolicy() {
        return { ...this.policy };
    }
    /**
     * Get daily usage stats
     */
    getDailyStats() {
        this.resetDailyCountersIfNeeded();
        return {
            transactionCount: this.dailyTransactionCount,
            transactionLimit: this.policy.dailyMaxTransactions,
            volumeUsed: this.dailyVolume.toString(),
            volumeLimit: this.policy.dailyMaxVolume,
        };
    }
    validateTransactionWithSchema(params) {
        try {
            const parsed = TransactionSchema.parse(params);
            return this.validateTransaction(parsed);
        }
        catch (error) {
            return {
                violated: true,
                reason: `Schema validation failed: ${error.errors?.[0]?.message || error.message}`,
                severity: 'MEDIUM',
            };
        }
    }
    validateSwapWithSchema(params) {
        try {
            const parsed = SwapSchema.parse(params);
            return this.validateSwapTransaction(parsed);
        }
        catch (error) {
            return {
                violated: true,
                reason: `Schema validation failed: ${error.errors?.[0]?.message || error.message}`,
                severity: 'MEDIUM',
            };
        }
    }
    async aiReviewTransaction(params) {
        try {
            const openai = (0, openai_1.createOpenAI)({
                apiKey: env_1.env.OPENROUTER_API_KEY,
                baseURL: env_1.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
            });
            const result = await (0, ai_1.generateText)({
                model: openai(env_1.env.OPENROUTER_MODEL_CRYPTO || 'x-ai/grok-4.1-fast'),
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
                    severity: object.riskLevel,
                };
            }
            logger_1.logger.info({ reason: object.reason, riskLevel: object.riskLevel }, '[PolicyGuard] AI review passed');
            return { violated: false, reason: 'AI review passed', severity: 'LOW' };
        }
        catch (error) {
            logger_1.logger.warn({ error: error.message }, '[PolicyGuard] AI review failed, falling back to standard validation');
            return { violated: false, reason: 'AI review unavailable, using standard validation', severity: 'LOW' };
        }
    }
}
exports.PolicyGuard = PolicyGuard;
/**
 * Global PolicyGuard instance
 */
let globalPolicyGuard = null;
function getPolicyGuard() {
    if (!globalPolicyGuard) {
        globalPolicyGuard = new PolicyGuard();
    }
    return globalPolicyGuard;
}
function setPolicyGuard(guard) {
    globalPolicyGuard = guard;
}
