import { logger } from '@/utils/logger';
import { getPolicyGuard } from '@/agent/middleware/PolicyGuard';
import { detectTransactionAnomaly } from '@/agent/services/AnomalyDetector';
import { RiskService } from '@/agent/services/RiskService';
import { ethers } from 'ethers';

export enum FinalOutcome {
  AUTO_APPROVE = 'auto_approve',
  FLAG_FOR_REVIEW = 'flag_for_review',
  REJECT = 'reject'
}

export interface TransactionInput {
  toAddress: string;
  amount: string;
  data?: string;
  transactionType: 'supply' | 'withdraw' | 'swap' | 'transfer' | 'bridge';
}

export interface PipelineResult {
  outcome: FinalOutcome;
  layers: {
    rules: { passed: boolean; reason?: string };
    anomaly: { isAnomaly: boolean; reason?: string; confidence: string };
    ai: { riskScore: number; explanation: string };
    human?: { reviewId: string; status: 'pending' | 'approved' | 'rejected' };
  };
  autoApproveReason?: string;
  flagReason?: string;
  rejectReason?: string;
}

export class GovernancePipeline {
  private riskService: RiskService;
  private flagThreshold: number = 70;
  private rejectThreshold: number = 90;

  constructor(riskService: RiskService) {
    this.riskService = riskService;
  }

  async processTransaction(
    walletAddress: string,
    input: TransactionInput
  ): Promise<{ transaction: TransactionInput; result: PipelineResult }> {
    const policyGuard = getPolicyGuard();
    const portfolioValue = '1000000000000000000';

    const result: PipelineResult = {
      outcome: FinalOutcome.AUTO_APPROVE,
      layers: {
        rules: { passed: false },
        anomaly: { isAnomaly: false, reason: '', confidence: 'high' },
        ai: { riskScore: 0, explanation: '' },
      }
    };

    const rulesResult = await this.evaluateRules(walletAddress, input, policyGuard, portfolioValue);
    result.layers.rules = rulesResult;

    if (!rulesResult.passed) {
      result.outcome = FinalOutcome.REJECT;
      result.rejectReason = rulesResult.reason;
      return { transaction: input, result };
    }

    const anomalyResult = await this.detectAnomaly(walletAddress, input);
    result.layers.anomaly = anomalyResult;

    const aiResult = await this.interpretWithAI(input, portfolioValue);
    result.layers.ai = aiResult;

    const riskScore = aiResult.riskScore;

    if (riskScore >= this.rejectThreshold) {
      result.outcome = FinalOutcome.REJECT;
      result.rejectReason = aiResult.explanation;
      return { transaction: input, result };
    }

    if (riskScore >= this.flagThreshold || anomalyResult.isAnomaly) {
      result.outcome = FinalOutcome.FLAG_FOR_REVIEW;
      result.flagReason = anomalyResult.isAnomaly
        ? `Anomaly detected: ${anomalyResult.reason}`
        : `AI risk score ${riskScore} exceeds threshold ${this.flagThreshold}`;
      return { transaction: input, result };
    }

    result.outcome = FinalOutcome.AUTO_APPROVE;
    result.autoApproveReason = `All layers passed. AI risk score: ${riskScore}`;
    return { transaction: input, result };
  }

  private async evaluateRules(
    walletAddress: string,
    input: TransactionInput,
    policyGuard: ReturnType<typeof getPolicyGuard>,
    portfolioValue: string
  ): Promise<{ passed: boolean; reason?: string }> {
    try {
      const violation = policyGuard.validateTransaction({
        toAddress: input.toAddress,
        amount: input.amount,
        currentRiskLevel: 'LOW',
        portfolioValue
      });

      if (violation.violated) {
        return { passed: false, reason: violation.reason };
      }

      return { passed: true };
    } catch (error) {
      return { passed: false, reason: `Rules evaluation error: ${error instanceof Error ? error.message : 'Unknown'}` };
    }
  }

  private async detectAnomaly(
    walletAddress: string,
    input: TransactionInput
  ): Promise<{ isAnomaly: boolean; reason: string; confidence: string }> {
    try {
      const amount = parseFloat(input.amount) / 1e6;
      if (isNaN(amount) || amount < 1) {
        return { isAnomaly: false, reason: 'Amount too small for anomaly detection', confidence: 'low' };
      }

      const anomalyResult = await detectTransactionAnomaly({
        walletAddress,
        amount,
        category: input.transactionType
      });

      return {
        isAnomaly: anomalyResult.is_anomaly,
        reason: anomalyResult.reason,
        confidence: anomalyResult.sample_size < 30 ? 'medium' : 'high'
      };
    } catch (error) {
      return { isAnomaly: false, reason: `Anomaly check error: ${error instanceof Error ? error.message : 'Unknown'}`, confidence: 'low' };
    }
  }

  private async interpretWithAI(
    input: TransactionInput,
    portfolioValue: string
  ): Promise<{ riskScore: number; explanation: string }> {
    try {
      const mockTxSimulation = {
        to: input.toAddress,
        amount: input.amount,
        type: input.transactionType,
        timestamp: Date.now()
      };

      const mockProfile = {
        level: 'LOW' as const,
        drawdownBps: 500,
        sharpe: 1.5,
        recommendedBuffer: 500,
        timestamp: Date.now()
      };

      const aiResult = await this.riskService.getAIRiskScore(mockTxSimulation, mockProfile);

      if (typeof aiResult.score === 'number') {
        return {
          riskScore: aiResult.score,
          explanation: aiResult.explanation || 'No explanation provided'
        };
      }

      return { riskScore: 50, explanation: 'Invalid AI response' };
    } catch (error) {
      logger.warn({ error }, '[GovernancePipeline] AI interpretation failed');
      return {
        riskScore: 50,
        explanation: `AI interpretation failed: ${error instanceof Error ? error.message : 'Unknown'}`
      };
    }
  }

  setThresholds(flagThreshold: number, rejectThreshold: number): void {
    this.flagThreshold = flagThreshold;
    this.rejectThreshold = rejectThreshold;
    logger.info({ flagThreshold, rejectThreshold }, '[GovernancePipeline] Thresholds updated');
  }

  getThresholds(): { flagThreshold: number; rejectThreshold: number } {
    return { flagThreshold: this.flagThreshold, rejectThreshold: this.rejectThreshold };
  }
}
