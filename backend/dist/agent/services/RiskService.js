"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskService = void 0;
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
const openai_1 = require("@ai-sdk/openai");
const ai_1 = require("ai");
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
            const result = await (0, ai_1.generateText)({
                model: openai(env_1.env.OPENROUTER_MODEL_CRYPTO || 'x-ai/grok-4.1-fast'),
                temperature: 0,
                prompt: `DeFi Risk Analysis for OmniAgent AFOS Agent.
Current Risk Profile: ${JSON.stringify(currentProfile)}
Transaction Simulation Result: ${JSON.stringify(txSimulation)}

Analyze the simulation for potential anomalies, protocol failures, or excessive risk.
Return JSON: {"score": 0-100, "explanation": "..."}`,
            });
            const object = JSON.parse(result.text);
            logger_1.logger.info({ score: object.score, explanation: object.explanation }, '[RiskService] AI Risk Score');
            return object;
        }
        catch (e) {
            logger_1.logger.error(e, '[RiskService] AI Risk Scoring failed');
            return { score: 50, explanation: `Safety fallback: AI scoring unreachable (${e.message})` };
        }
    }
    async getRiskProfile() {
        try {
            const oracleAddress = await this.zkOracle.getAddress();
            logger_1.logger.debug({ oracleAddress }, '[RiskService] Fetching risk from ZK Oracle');
            // Check for misconfiguration via environment variable
            const sharpeTracker = env_1.env.WDK_SHARPE_TRACKER_ADDRESS;
            if (sharpeTracker && oracleAddress.toLowerCase() === sharpeTracker.toLowerCase()) {
                logger_1.logger.warn({ sharpeTracker }, '[RiskService] CONFIGURATION WARNING: WDK_ZK_ORACLE_ADDRESS is pointing to SharpeTracker. Using safe fallback.');
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
            logger_1.logger.error(error, '[RiskService] WARNING: Failed to fetch ZK Risk metrics. Defaulting to LOW risk.');
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
        const sepoliaAccount = await this.wdk.getAccount('sepolia');
        logger_1.logger.warn({ reason }, '[RiskService] EMERGENCY PAUSE TRIGGERED');
        // Pause selector: 0x8456d592
        const data = '0x8456d592';
        const tx = await sepoliaAccount.sendTransaction({
            to: await this.breaker.getAddress(),
            value: 0n,
            data: data
        });
        logger_1.logger.info({ txHash: tx.hash }, 'Vault Paused');
        return tx;
    }
}
exports.RiskService = RiskService;
