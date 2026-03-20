import { logger } from '@/utils/logger';
import {
  zScore,
  iqrOutlier,
  detectAnomaly,
  coldStartWarning,
  mean,
  stdDev,
  CombinedAnomalyResult
} from '@/utils/statistics';

export interface AnomalyDetectionInput {
  walletAddress: string;
  amount: number;
  category?: string;
}

export interface AnomalyResult {
  is_anomaly: boolean;
  z_score: number | null;
  iqr_outlier: boolean;
  method: 'z_score' | 'iqr' | 'cold_start' | 'combined';
  historical_mean: number | null;
  historical_std: number | null;
  sample_size: number;
  threshold: number;
  reason: string;
}

interface TransactionHistory {
  amounts: number[];
  timestamps: number[];
  categories: string[];
}

const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_HISTORY_SAMPLES = 30;
const DEFAULT_Z_THRESHOLD = 2.5;
const DEFAULT_IQR_K = 1.5;

class AnomalyDetectorService {
  private transactionHistory: Map<string, TransactionHistory> = new Map();
  private categoryThresholds: Map<string, { zThreshold: number; iqrK: number }> = new Map();

  constructor() {
    this.categoryThresholds.set('supply', { zThreshold: 2.5, iqrK: 1.5 });
    this.categoryThresholds.set('withdraw', { zThreshold: 2.0, iqrK: 1.5 });
    this.categoryThresholds.set('transfer', { zThreshold: 2.0, iqrK: 1.2 });
    this.categoryThresholds.set('swap', { zThreshold: 3.0, iqrK: 1.8 });
  }

  async detectAnomaly(input: AnomalyDetectionInput): Promise<AnomalyResult> {
    const { walletAddress, amount, category = 'default' } = input;
    const history = this.getHistory(walletAddress, category);
    const thresholds = this.categoryThresholds.get(category) || { zThreshold: DEFAULT_Z_THRESHOLD, iqrK: DEFAULT_IQR_K };
    const now = Date.now();

    if (history.amounts.length < MIN_HISTORY_SAMPLES) {
      const coldStart = coldStartWarning(history.amounts.length, MIN_HISTORY_SAMPLES);
      return {
        is_anomaly: false,
        z_score: null,
        iqr_outlier: false,
        method: 'cold_start',
        historical_mean: history.amounts.length > 0 ? mean(history.amounts) : null,
        historical_std: history.amounts.length > 1 ? stdDev(history.amounts, true) : null,
        sample_size: history.amounts.length,
        threshold: MIN_HISTORY_SAMPLES,
        reason: coldStart.message
      };
    }

    const result = detectAnomaly(amount, history.amounts, thresholds.zThreshold, thresholds.iqrK);

    this.recordTransaction(walletAddress, category, amount, now);

    return {
      is_anomaly: result.isAnomaly,
      z_score: result.zScoreResult.zScore,
      iqr_outlier: result.iqrResult.isOutlier,
      method: result.zScoreResult.isOutlier && result.iqrResult.isOutlier ? 'combined' : 
              result.zScoreResult.isOutlier ? 'z_score' : 'iqr',
      historical_mean: mean(history.amounts),
      historical_std: stdDev(history.amounts, true),
      sample_size: history.amounts.length,
      threshold: thresholds.zThreshold,
      reason: result.combinedReason
    };
  }

  private getHistory(walletAddress: string, category: string): TransactionHistory {
    const key = `${walletAddress}:${category}`;
    if (!this.transactionHistory.has(key)) {
      this.transactionHistory.set(key, { amounts: [], timestamps: [], categories: [] });
    }
    return this.transactionHistory.get(key)!;
  }

  private recordTransaction(walletAddress: string, category: string, amount: number, timestamp: number): void {
    const history = this.getHistory(walletAddress, category);
    const cutoff = timestamp - HISTORY_RETENTION_MS;

    while (history.timestamps.length > 0 && history.timestamps[0] < cutoff) {
      history.amounts.shift();
      history.timestamps.shift();
      history.categories.shift();
    }

    history.amounts.push(amount);
    history.timestamps.push(timestamp);
    history.categories.push(category);
  }

  getThresholds(category: string): { zThreshold: number; iqrK: number } | undefined {
    return this.categoryThresholds.get(category);
  }

  setThresholds(category: string, zThreshold: number, iqrK: number): void {
    this.categoryThresholds.set(category, { zThreshold, iqrK });
  }

  getHistoryStats(walletAddress: string, category?: string): { sampleSize: number; mean: number; std: number } | null {
    if (category) {
      const history = this.getHistory(walletAddress, category);
      if (history.amounts.length === 0) return null;
      return {
        sampleSize: history.amounts.length,
        mean: mean(history.amounts),
        std: stdDev(history.amounts, true)
      };
    }

    let totalSamples = 0;
    let allAmounts: number[] = [];
    for (const [key, history] of this.transactionHistory.entries()) {
      if (key.startsWith(walletAddress)) {
        totalSamples += history.amounts.length;
        allAmounts = allAmounts.concat(history.amounts);
      }
    }

    if (allAmounts.length === 0) return null;
    return {
      sampleSize: totalSamples,
      mean: mean(allAmounts),
      std: stdDev(allAmounts, true)
    };
  }

  clearHistory(walletAddress?: string): void {
    if (walletAddress) {
      for (const key of this.transactionHistory.keys()) {
        if (key.startsWith(walletAddress)) {
          this.transactionHistory.delete(key);
        }
      }
    } else {
      this.transactionHistory.clear();
    }
  }
}

export const anomalyDetector = new AnomalyDetectorService();

export async function detectTransactionAnomaly(input: AnomalyDetectionInput): Promise<AnomalyResult> {
  try {
    return await anomalyDetector.detectAnomaly(input);
  } catch (error) {
    logger.error({ error, input }, '[AnomalyDetector] Detection failed');
    return {
      is_anomaly: false,
      z_score: null,
      iqr_outlier: false,
      method: 'cold_start',
      historical_mean: null,
      historical_std: null,
      sample_size: 0,
      threshold: MIN_HISTORY_SAMPLES,
      reason: `Error during detection: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}
