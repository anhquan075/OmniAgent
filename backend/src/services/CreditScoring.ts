/**
 * CreditScoring — Agent credit score based on transaction history.
 *
 * Adapted from Arbiter's credit scoring model:
 * - Score range: 0-1000 (default: 500 for new agents)
 * - Factors: transaction success rate, volume, consistency, repayment history
 * - Risk levels: LOW (700+), MEDIUM (400-699), HIGH (<400)
 *
 * Used by PolicyGuard to dynamically adjust transaction limits per agent.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@/utils/logger';

// ── Constants ────────────────────────────────────────────────────────

const CREDIT_FILE = process.env.CREDIT_STORAGE_PATH
  || path.join(process.cwd(), 'cache', 'credit-scores.json');

/** Score range */
const MIN_SCORE = 0;
const MAX_SCORE = 1000;
const DEFAULT_SCORE = 500;

/** Score weights */
const WEIGHTS = {
  successRate: 0.35,      // Transaction success ratio
  volumeScore: 0.20,      // Total volume handled
  consistency: 0.20,      // Regular activity (not bursty)
  errorPenalty: 0.15,     // Recent errors penalized
  ageBonus: 0.10,         // Longer history = more trust
};

/** Risk level thresholds */
const RISK_THRESHOLDS = {
  LOW: 700,
  MEDIUM: 400,
  HIGH: 0,
};

// ── Types ────────────────────────────────────────────────────────────

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface CreditHistory {
  agentId: string;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalVolumeUsdt: string;   // BigInt serialized
  totalLossUsdt: string;     // BigInt serialized (failed tx costs)
  averageTxSizeUsdt: string;
  lastTxTimestamp: number;
  firstTxTimestamp: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  score: number;
  riskLevel: RiskLevel;
  lastUpdated: number;
}

export interface CreditScoreResult {
  agentId: string;
  score: number;
  riskLevel: RiskLevel;
  factors: {
    successRate: number;
    volumeScore: number;
    consistency: number;
    errorPenalty: number;
    ageBonus: number;
  };
  stats: {
    totalTransactions: number;
    successRate: string;
    totalVolumeUsdt: string;
    avgTxSizeUsdt: string;
    accountAgeDays: number;
  };
  limits: {
    maxSingleTxUsdt: number;
    dailyLimitUsdt: number;
    requiresApproval: boolean;
  };
}

// ── Storage ──────────────────────────────────────────────────────────

function ensureCacheDir(): void {
  const cacheDir = path.dirname(CREDIT_FILE);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
}

function loadAllScores(): Record<string, CreditHistory> {
  try {
    ensureCacheDir();
    if (!fs.existsSync(CREDIT_FILE)) return {};
    return JSON.parse(fs.readFileSync(CREDIT_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveAllScores(scores: Record<string, CreditHistory>): void {
  try {
    ensureCacheDir();
    fs.writeFileSync(CREDIT_FILE, JSON.stringify(scores, null, 2));
  } catch (err) {
    logger.warn({ err }, '[CreditScoring] Failed to save scores');
  }
}

// ── Scoring Logic ────────────────────────────────────────────────────

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Calculate credit score from history.
 * Adapted from Arbiter's calculateCreditScore().
 */
function calculateCreditScore(history: CreditHistory): number {
  if (history.totalTransactions === 0) {
    return DEFAULT_SCORE;
  }

  const totalTx = Math.max(history.totalTransactions, 1);

  // Factor 1: Success rate (0-1000 contribution)
  const successRate = history.successfulTransactions / totalTx;
  const successRateScore = successRate * 1000 * WEIGHTS.successRate;

  // Factor 2: Volume score (capped, log-scaled)
  const volume = Number(history.totalVolumeUsdt) || 0;
  const volumeScore = Math.min(Math.log10(volume + 1) * 100, 1000) * WEIGHTS.volumeScore;

  // Factor 3: Consistency (regular activity, not bursty)
  const daysActive = Math.max(
    (history.lastTxTimestamp - history.firstTxTimestamp) / (24 * 60 * 60 * 1000),
    1
  );
  const txPerDay = totalTx / daysActive;
  const consistencyScore = clamp(txPerDay * 50, 0, 1000) * WEIGHTS.consistency;

  // Factor 4: Error penalty (recent failures weighted heavily)
  const errorRate = history.failedTransactions / totalTx;
  const errorPenalty = errorRate * 1000 * WEIGHTS.errorPenalty;

  // Factor 5: Age bonus (older accounts are more trusted)
  const ageDays = Math.min(daysActive, 365);
  const ageBonus = (ageDays / 365) * 1000 * WEIGHTS.ageBonus;

  // Consecutive success/failure adjustment
  const consecutiveBonus = Math.min(history.consecutiveSuccesses * 10, 50);
  const consecutivePenalty = Math.min(history.consecutiveFailures * 20, 100);

  const rawScore =
    DEFAULT_SCORE +
    successRateScore +
    volumeScore +
    consistencyScore +
    ageBonus -
    errorPenalty -
    consecutivePenalty +
    consecutiveBonus;

  return clamp(Math.round(rawScore), MIN_SCORE, MAX_SCORE);
}

function determineRiskLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.LOW) return 'LOW';
  if (score >= RISK_THRESHOLDS.MEDIUM) return 'MEDIUM';
  return 'HIGH';
}

function calculateLimits(riskLevel: RiskLevel, score: number): {
  maxSingleTxUsdt: number;
  dailyLimitUsdt: number;
  requiresApproval: boolean;
} {
  switch (riskLevel) {
    case 'LOW':
      return {
        maxSingleTxUsdt: 50_000,
        dailyLimitUsdt: 200_000,
        requiresApproval: false,
      };
    case 'MEDIUM':
      return {
        maxSingleTxUsdt: 10_000,
        dailyLimitUsdt: 50_000,
        requiresApproval: score < 500,
      };
    case 'HIGH':
      return {
        maxSingleTxUsdt: 1_000,
        dailyLimitUsdt: 5_000,
        requiresApproval: true,
      };
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Get credit score for an agent. Creates default if not exists.
 */
export function getCreditScore(agentId: string): CreditScoreResult {
  const allScores = loadAllScores();
  const history = allScores[agentId] || createDefaultHistory(agentId);

  const score = calculateCreditScore(history);
  const riskLevel = determineRiskLevel(score);

  history.score = score;
  history.riskLevel = riskLevel;
  history.lastUpdated = Date.now();
  allScores[agentId] = history;
  saveAllScores(allScores);

  const totalTx = Math.max(history.totalTransactions, 1);
  const successRate = history.successfulTransactions / totalTx;
  const volume = Number(history.totalVolumeUsdt) || 0;
  const avgTxSize = history.totalTransactions > 0
    ? volume / history.totalTransactions
    : 0;
  const daysActive = Math.max(
    (history.lastTxTimestamp - history.firstTxTimestamp) / (24 * 60 * 60 * 1000),
    0
  );

  const limits = calculateLimits(riskLevel, score);

  return {
    agentId,
    score,
    riskLevel,
    factors: {
      successRate: Number((successRate * 100).toFixed(1)),
      volumeScore: Math.min(Math.log10(volume + 1) * 100, 1000).toFixed(0) as unknown as number,
      consistency: Number((Math.min((totalTx / Math.max(daysActive, 1)) * 50, 100)).toFixed(1)),
      errorPenalty: Number(((history.failedTransactions / totalTx) * 100).toFixed(1)),
      ageBonus: Number(Math.min(daysActive, 365).toFixed(0)),
    },
    stats: {
      totalTransactions: history.totalTransactions,
      successRate: `${(successRate * 100).toFixed(1)}%`,
      totalVolumeUsdt: history.totalVolumeUsdt,
      avgTxSizeUsdt: avgTxSize.toFixed(2),
      accountAgeDays: Math.floor(daysActive),
    },
    limits,
  };
}

/**
 * Record a transaction outcome for credit scoring.
 */
export function recordTransaction(params: {
  agentId: string;
  success: boolean;
  volumeUsdt: bigint;
  lossUsdt?: bigint;
}): void {
  const { agentId, success, volumeUsdt, lossUsdt = 0n } = params;

  const allScores = loadAllScores();
  const history = allScores[agentId] || createDefaultHistory(agentId);
  const now = Date.now();

  // Initialize timestamps on first tx
  if (history.totalTransactions === 0) {
    history.firstTxTimestamp = now;
  }

  history.totalTransactions += 1;
  history.lastTxTimestamp = now;

  if (success) {
    history.successfulTransactions += 1;
    history.consecutiveSuccesses += 1;
    history.consecutiveFailures = 0;
    history.totalVolumeUsdt = (BigInt(history.totalVolumeUsdt) + volumeUsdt).toString();
  } else {
    history.failedTransactions += 1;
    history.consecutiveFailures += 1;
    history.consecutiveSuccesses = 0;
    history.totalLossUsdt = (BigInt(history.totalLossUsdt) + lossUsdt).toString();
  }

  // Recalculate score
  history.score = calculateCreditScore(history);
  history.riskLevel = determineRiskLevel(history.score);
  history.lastUpdated = now;

  allScores[agentId] = history;
  saveAllScores(allScores);

  logger.info({
    agentId,
    success,
    newScore: history.score,
    riskLevel: history.riskLevel,
    totalTx: history.totalTransactions,
  }, '[CreditScoring] Transaction recorded');
}

/**
 * Check if agent meets requirements for a transaction.
 */
export function checkCreditRequirements(params: {
  agentId: string;
  requestedAmountUsdt: bigint;
}): {
  allowed: boolean;
  reason?: string;
  score: number;
  riskLevel: RiskLevel;
} {
  const { agentId, requestedAmountUsdt } = params;
  const result = getCreditScore(agentId);
  const amount = Number(requestedAmountUsdt);

  if (result.limits.requiresApproval) {
    return {
      allowed: false,
      reason: `Agent ${agentId} requires human approval (score: ${result.score}, risk: ${result.riskLevel})`,
      score: result.score,
      riskLevel: result.riskLevel,
    };
  }

  if (amount > result.limits.maxSingleTxUsdt) {
    return {
      allowed: false,
      reason: `Amount ${amount} USDT exceeds single tx limit ${result.limits.maxSingleTxUsdt} for risk level ${result.riskLevel}`,
      score: result.score,
      riskLevel: result.riskLevel,
    };
  }

  return {
    allowed: true,
    score: result.score,
    riskLevel: result.riskLevel,
  };
}

/**
 * Get all agents ranked by credit score.
 */
export function getLeaderboard(limit: number = 10): CreditScoreResult[] {
  const allScores = loadAllScores();
  return Object.keys(allScores)
    .map(agentId => getCreditScore(agentId))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── Helpers ──────────────────────────────────────────────────────────

function createDefaultHistory(agentId: string): CreditHistory {
  return {
    agentId,
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    totalVolumeUsdt: '0',
    totalLossUsdt: '0',
    averageTxSizeUsdt: '0',
    lastTxTimestamp: Date.now(),
    firstTxTimestamp: Date.now(),
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    score: DEFAULT_SCORE,
    riskLevel: 'MEDIUM',
    lastUpdated: Date.now(),
  };
}
