import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { createOpenAI } from '@ai-sdk/openai';
import { Contract } from 'ethers';
import { z } from 'zod';

export interface RiskProfile {
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  drawdownBps: number;
  sharpe: number;
  recommendedBuffer: number;
  timestamp: number;
  message?: string;
}

export class RiskService {
  private zkOracle: Contract;
  private breaker: Contract;
  private wdk: any;

  // Thresholds
  private readonly HIGH_RISK_DRAWDOWN_BPS = 2000; // 20% expected drawdown
  private readonly MEDIUM_RISK_DRAWDOWN_BPS = 1000; // 10% expected drawdown

  constructor(zkOracleContract: Contract, circuitBreakerContract: Contract, wdk: any) {
    this.zkOracle = zkOracleContract;
    this.breaker = circuitBreakerContract;
    this.wdk = wdk;
  }

  /**
   * AI-powered risk scoring using AI SDK Core
   */
  async getAIRiskScore(txSimulation: any, currentProfile: RiskProfile) {
    const openai = createOpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    });

    try {
      const { object } = await generateText({
        model: openai(env.OPENROUTER_MODEL_CRYPTO || 'x-ai/grok-4.1-fast'),
        temperature: 0,
        schema: z.object({
          score: z.number().min(0).max(100).describe('Risk score from 0 to 100'),
          explanation: z.string().describe('Brief explanation of the risk assessment')
        }),
        prompt: `DeFi Risk Analysis for OmniAgent AFOS Agent.
Current Risk Profile: ${JSON.stringify(currentProfile)}
Transaction Simulation Result: ${JSON.stringify(txSimulation)}

Analyze the simulation for potential anomalies, protocol failures, or excessive risk.
Return a score from 0 (Safe) to 100 (Extremely Risky) and a concise explanation.`,
      });

      logger.info({ score: object.score, explanation: object.explanation }, '[RiskService] AI Risk Score');
      return object;
    } catch (e: any) {
      logger.error(e, '[RiskService] AI Risk Scoring failed');
      return { score: 50, explanation: `Safety fallback: AI scoring unreachable (${e.message})` };
    }
  }

  async getRiskProfile(): Promise<RiskProfile> {
    try {
      const oracleAddress = await this.zkOracle.getAddress();
      logger.debug({ oracleAddress }, '[RiskService] Fetching risk from ZK Oracle');
      
      // Check for misconfiguration via environment variable
      const sharpeTracker = env.WDK_SHARPE_TRACKER_ADDRESS;
      if (sharpeTracker && oracleAddress.toLowerCase() === sharpeTracker.toLowerCase()) {
        logger.warn({ sharpeTracker }, '[RiskService] CONFIGURATION WARNING: WDK_ZK_ORACLE_ADDRESS is pointing to SharpeTracker. Using safe fallback.');
        return this.getSafeFallbackProfile("Config Error: Using SharpeTracker instead of ZKRiskOracle");
      }

      // Try actual call
      const metrics = await this.zkOracle.getVerifiedRiskBands();
      const drawdown = Number(metrics.monteCarloDrawdownBps);
      
      let level: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      if (drawdown >= this.HIGH_RISK_DRAWDOWN_BPS) level = 'HIGH';
      else if (drawdown >= this.MEDIUM_RISK_DRAWDOWN_BPS) level = 'MEDIUM';

      return {
        level,
        drawdownBps: drawdown,
        sharpe: Number(metrics.verifiedSharpeRatio) / 100,
        recommendedBuffer: Number(metrics.recommendedBufferBps),
        timestamp: Number(metrics.timestamp),
        message: "ZK-Proven Metrics"
      };
    } catch (error: any) {
      logger.error(error, '[RiskService] WARNING: Failed to fetch ZK Risk metrics. Defaulting to LOW risk.');
      return this.getSafeFallbackProfile(`Contract Revert: ${error.message}`);
    }
  }

  private getSafeFallbackProfile(reason: string): RiskProfile {
    return {
      level: 'LOW',
      drawdownBps: 0,
      sharpe: 0,
      recommendedBuffer: 500,
      timestamp: Math.floor(Date.now() / 1000),
      message: `Safe Fallback: ${reason}`
    };
  }

  async triggerEmergencyPause(reason: string) {
    const bnbAccount = await this.wdk.getAccount('bnb');
    logger.warn({ reason }, '[RiskService] EMERGENCY PAUSE TRIGGERED');
    
    // Pause selector: 0x8456d592
    const data = '0x8456d592'; 
    
    const tx = await bnbAccount.sendTransaction({
      to: await this.breaker.getAddress(),
      value: 0n,
      data: data
    } as any);

    logger.info({ txHash: tx.hash }, 'Vault Paused');
    return tx;
  }
}
