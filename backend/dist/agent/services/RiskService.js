"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskService = void 0;
const ai_1 = require("ai");
const openai_1 = require("@ai-sdk/openai");
const zod_1 = require("zod");
const env_1 = require("../../config/env");
class RiskService {
    zkOracle;
    breaker;
    wdk;
    // Thresholds
    HIGH_RISK_DRAWDOWN_BPS = 2000; // 20% expected drawdown
    MEDIUM_RISK_DRAWDOWN_BPS = 1000; // 10% expected drawdown
    constructor(zkOracleContract, circuitBreakerContract, wdk) {
        this.zkOracle = zkOracleContract;
        this.breaker = circuitBreakerContract;
        this.wdk = wdk;
    }
    /**
     * AI-powered risk scoring using AI SDK Core
     */
    async getAIRiskScore(txSimulation, currentProfile) {
        const openai = (0, openai_1.createOpenAI)({
            apiKey: env_1.env.OPENROUTER_API_KEY,
            baseURL: env_1.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
        });
        try {
            const { object } = await (0, ai_1.generateObject)({
                model: openai(env_1.env.OPENROUTER_MODEL_CRYPTO || 'deepseek/deepseek-chat'),
                schema: zod_1.z.object({
                    score: zod_1.z.number().min(0).max(100).describe('Risk score from 0 to 100'),
                    explanation: zod_1.z.string().describe('Brief explanation of the risk assessment')
                }),
                prompt: `DeFi Risk Analysis for OmniWDK AFOS Agent.
Current Risk Profile: ${JSON.stringify(currentProfile)}
Transaction Simulation Result: ${JSON.stringify(txSimulation)}

Analyze the simulation for potential anomalies, protocol failures, or excessive risk.
Return a score from 0 (Safe) to 100 (Extremely Risky) and a concise explanation.`,
            });
            console.log(`[RiskService] AI Risk Score: ${object.score}/100. Reason: ${object.explanation}`);
            return object;
        }
        catch (e) {
            console.error(`[RiskService] AI Risk Scoring failed: ${e.message}`);
            return { score: 50, explanation: `Safety fallback: AI scoring unreachable (${e.message})` };
        }
    }
    async getRiskProfile() {
        try {
            const oracleAddress = await this.zkOracle.getAddress();
            console.log(`[RiskService] Fetching risk from ZK Oracle at: ${oracleAddress}`);
            // Check for misconfiguration via environment variable
            const sharpeTracker = env_1.env.WDK_SHARPE_TRACKER_ADDRESS;
            if (sharpeTracker && oracleAddress.toLowerCase() === sharpeTracker.toLowerCase()) {
                console.warn(`[RiskService] CONFIGURATION WARNING: WDK_ZK_ORACLE_ADDRESS is pointing to SharpeTracker (${sharpeTracker}). Using safe fallback.`);
                return this.getSafeFallbackProfile("Config Error: Using SharpeTracker instead of ZKRiskOracle");
            }
            // Try actual call
            const metrics = await this.zkOracle.getVerifiedRiskBands();
            const drawdown = Number(metrics.monteCarloDrawdownBps);
            let level = 'LOW';
            if (drawdown >= this.HIGH_RISK_DRAWDOWN_BPS)
                level = 'HIGH';
            else if (drawdown >= this.MEDIUM_RISK_DRAWDOWN_BPS)
                level = 'MEDIUM';
            return {
                level,
                drawdownBps: drawdown,
                sharpe: Number(metrics.verifiedSharpeRatio) / 100,
                recommendedBuffer: Number(metrics.recommendedBufferBps),
                timestamp: Number(metrics.timestamp),
                message: "ZK-Proven Metrics"
            };
        }
        catch (error) {
            console.error(`[RiskService] WARNING: Failed to fetch ZK Risk metrics: ${error.message}. Defaulting to LOW risk.`);
            return this.getSafeFallbackProfile(`Contract Revert: ${error.message}`);
        }
    }
    getSafeFallbackProfile(reason) {
        return {
            level: 'LOW',
            drawdownBps: 0,
            sharpe: 0,
            recommendedBuffer: 500,
            timestamp: Math.floor(Date.now() / 1000),
            message: `Safe Fallback: ${reason}`
        };
    }
    async triggerEmergencyPause(reason) {
        const bnbAccount = await this.wdk.getAccount('bnb');
        console.log(`[RiskService] EMERGENCY PAUSE TRIGGERED: ${reason}`);
        // Pause selector: 0x8456d592
        const data = '0x8456d592';
        const tx = await bnbAccount.sendTransaction({
            to: await this.breaker.getAddress(),
            value: 0n,
            data: data
        });
        console.log(`Vault Paused! Hash: ${tx.hash}`);
        return tx;
    }
}
exports.RiskService = RiskService;
