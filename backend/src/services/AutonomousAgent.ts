import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { ethers } from 'ethers';
import {
  getAaveProtocol,
  supplyToAave,
  withdrawFromAave,
  getAaveAccountData,
  TOKEN_ADDRESSES
} from './WdkProtocolService';
import { detectTransactionAnomaly, AnomalyResult } from '@/agent/services/AnomalyDetector';

interface AgentState {
  lastAction: string;
  lastActionTime: number;
  consecutiveFailures: number;
  totalSuppliedUsdt: bigint;
  totalSuppliedXaut: bigint;
  totalWithdrawnUsdt: bigint;
  totalWithdrawnXaut: bigint;
  healthFactor: bigint;
  previousHealthFactor: bigint;
  healthFactorVelocity: number;
  marketCondition: 'bullish' | 'bearish' | 'neutral';
  strategy: 'supply_usdt' | 'supply_xaut' | 'withdraw' | 'hold';
  circuitBreakerActive: boolean;
  lastCircuitBreakerTime: number;
}

interface MarketData {
  yieldRate: number;
  volatility: number;
  healthFactor: bigint;
  utilizationBps: number;
  goldPriceChangeBps: number;
  oracleFresh: boolean;
  lastOracleUpdate: number;
}

interface DecisionResult {
  action: 'supply_usdt' | 'supply_xaut' | 'withdraw' | 'hold' | 'rebalance' | 'emergency' | 'flagged';
  reason: string;
  amount?: bigint;
  token?: string;
  confidence: number;
  anomalyResult?: AnomalyResult;
}

const MAX_CONSECUTIVE_FAILURES = 3;
const MIN_HEALTH_FACTOR = 1500000000000000000n;
const EMERGENCY_HEALTH_FACTOR = 1200000000000000000n;
const YIELD_THRESHOLD_BPS = 500;
const VOLATILITY_THRESHOLD_BPS = 1000;
const MAX_DRAWDOWN_BPS = 500;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60000;
const ORACLE_MAX_AGE_SECONDS = 300;
const HEALTH_FACTOR_VELOCITY_THRESHOLD = 0.1;

let state: AgentState = {
  lastAction: 'init',
  lastActionTime: Date.now(),
  consecutiveFailures: 0,
  totalSuppliedUsdt: 0n,
  totalSuppliedXaut: 0n,
  totalWithdrawnUsdt: 0n,
  totalWithdrawnXaut: 0n,
  healthFactor: 0n,
  previousHealthFactor: 0n,
  healthFactorVelocity: 0,
  marketCondition: 'neutral',
  strategy: 'hold',
  circuitBreakerActive: false,
  lastCircuitBreakerTime: 0
};

function checkCircuitBreaker(): { tripped: boolean; reason: string } {
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    const timeSinceLastBreaker = Date.now() - state.lastCircuitBreakerTime;
    if (timeSinceLastBreaker < CIRCUIT_BREAKER_COOLDOWN_MS) {
      return {
        tripped: true,
        reason: `Circuit breaker active. Cooling down for ${Math.ceil((CIRCUIT_BREAKER_COOLDOWN_MS - timeSinceLastBreaker) / 1000)}s`
      };
    }
  }

  if (state.healthFactor > 0n && state.healthFactor < EMERGENCY_HEALTH_FACTOR) {
    return {
      tripped: true,
      reason: `Emergency: Health factor ${ethers.formatUnits(state.healthFactor, 18)} below emergency threshold ${ethers.formatUnits(EMERGENCY_HEALTH_FACTOR, 18)}`
    };
  }

  if (Math.abs(state.healthFactorVelocity) > HEALTH_FACTOR_VELOCITY_THRESHOLD) {
    return {
      tripped: true,
      reason: `Emergency: Health factor velocity ${state.healthFactorVelocity.toFixed(3)}/min exceeds threshold ${HEALTH_FACTOR_VELOCITY_THRESHOLD}/min`
    };
  }

  return { tripped: false, reason: '' };
}

function checkOracleFreshness(lastUpdate: number): { fresh: boolean; reason: string } {
  const ageSeconds = (Date.now() - lastUpdate) / 1000;
  if (ageSeconds > ORACLE_MAX_AGE_SECONDS) {
    return {
      fresh: false,
      reason: `Oracle data is stale (${Math.round(ageSeconds)}s old). Max allowed: ${ORACLE_MAX_AGE_SECONDS}s`
    };
  }
  return { fresh: true, reason: '' };
}

async function getMarketData(): Promise<MarketData> {
  try {
    const aaveData = await getAaveAccountData();
    const utilizationBps = aaveData.totalDebtBase > 0n
      ? Number((aaveData.totalDebtBase * 10000n) / aaveData.totalCollateralBase)
      : 0;

    state.previousHealthFactor = state.healthFactor;
    state.healthFactor = aaveData.healthFactor;

    if (state.previousHealthFactor > 0n && state.healthFactor > 0n) {
      const healthFactorChange = Number(ethers.formatUnits(state.healthFactor - state.previousHealthFactor, 18));
      const timeDeltaMinutes = (Date.now() - state.lastActionTime) / 60000;
      state.healthFactorVelocity = timeDeltaMinutes > 0 ? healthFactorChange / timeDeltaMinutes : 0;
    }

    return {
      yieldRate: 500,
      volatility: 200,
      healthFactor: aaveData.healthFactor,
      utilizationBps,
      goldPriceChangeBps: 50,
      oracleFresh: true,
      lastOracleUpdate: Date.now()
    };
  } catch (error) {
    logger.warn(error, '[AutonomousAgent] Failed to get market data');
    return {
      yieldRate: 0,
      volatility: 0,
      healthFactor: 0n,
      utilizationBps: 0,
      goldPriceChangeBps: 0,
      oracleFresh: false,
      lastOracleUpdate: 0
    };
  }
}

async function checkAnomaly(amount: bigint, category: string): Promise<AnomalyResult | null> {
  try {
    const anomalyResult = await detectTransactionAnomaly({
      walletAddress: 'agent-wallet',
      amount: Number(ethers.formatUnits(amount, 6)),
      category
    });
    return anomalyResult;
  } catch (error) {
    logger.warn({ error }, '[AutonomousAgent] Anomaly detection failed');
    return null;
  }
}

function decideStrategy(market: MarketData): DecisionResult {
  const oracleCheck = checkOracleFreshness(market.lastOracleUpdate);
  if (!oracleCheck.fresh) {
    return {
      action: 'hold',
      reason: oracleCheck.reason,
      confidence: 100
    };
  }

  const circuitBreaker = checkCircuitBreaker();
  if (circuitBreaker.tripped) {
    state.circuitBreakerActive = true;
    state.lastCircuitBreakerTime = Date.now();
    return {
      action: 'hold',
      reason: circuitBreaker.reason,
      confidence: 100
    };
  }

  if (market.healthFactor > 0n && market.healthFactor < EMERGENCY_HEALTH_FACTOR) {
    return {
      action: 'emergency',
      reason: `EMERGENCY: Health factor ${ethers.formatUnits(market.healthFactor, 18)} critically low. Withdrawing to safety.`,
      confidence: 100
    };
  }

  if (Math.abs(state.healthFactorVelocity) > HEALTH_FACTOR_VELOCITY_THRESHOLD) {
    return {
      action: 'withdraw',
      reason: `Health factor velocity ${state.healthFactorVelocity.toFixed(3)}/min is alarming. Reducing exposure.`,
      confidence: 95
    };
  }

  if (market.healthFactor > 0n && market.healthFactor < MIN_HEALTH_FACTOR) {
    return {
      action: 'supply_usdt',
      reason: `Health factor ${ethers.formatUnits(market.healthFactor, 18)} below safety threshold ${ethers.formatUnits(MIN_HEALTH_FACTOR, 18)}. Adding collateral.`,
      confidence: 90
    };
  }

  if (market.goldPriceChangeBps > 100) {
    return {
      action: 'supply_xaut',
      reason: `Gold price rising ${market.goldPriceChangeBps}bps. Diversifying into XAUT.`,
      confidence: 75
    };
  }

  if (market.yieldRate > YIELD_THRESHOLD_BPS) {
    return {
      action: 'supply_usdt',
      reason: `Yield rate ${market.yieldRate}bps exceeds threshold ${YIELD_THRESHOLD_BPS}bps.`,
      confidence: 80
    };
  }

  if (market.volatility > VOLATILITY_THRESHOLD_BPS) {
    return {
      action: 'withdraw',
      reason: `Volatility ${market.volatility}bps exceeds threshold ${VOLATILITY_THRESHOLD_BPS}bps. Reducing exposure.`,
      confidence: 70
    };
  }

  if (market.utilizationBps > 8000) {
    return {
      action: 'withdraw',
      reason: `Utilization ${market.utilizationBps}bps too high. Risk of liquidation.`,
      confidence: 85
    };
  }

  return {
    action: 'hold',
    reason: 'Market conditions stable. No action needed.',
    confidence: 60
  };
}

const ANOMALY_HIGH_AMOUNT_THRESHOLD = ethers.parseUnits('500', 6);

async function executeDecision(decision: DecisionResult): Promise<boolean> {
  const usdtAddress = TOKEN_ADDRESSES.mainnet.USDT;
  const xautAddress = TOKEN_ADDRESSES.mainnet.XAUT;

  try {
    if (decision.action === 'supply_usdt' || decision.action === 'supply_xaut' || decision.action === 'withdraw') {
      const amount = decision.amount || ethers.parseUnits('100', 6);
      if (amount >= ANOMALY_HIGH_AMOUNT_THRESHOLD) {
        const anomalyResult = await checkAnomaly(amount, decision.action === 'withdraw' ? 'withdraw' : 'supply');
        if (anomalyResult?.is_anomaly) {
          logger.warn({ anomalyResult, decision }, '[AutonomousAgent] Transaction flagged by anomaly detector');
          decision.anomalyResult = anomalyResult;
          return false;
        }
      }
    }

    switch (decision.action) {
      case 'emergency': {
        const amount = decision.amount || ethers.parseUnits('200', 6);
        if (!usdtAddress) throw new Error('USDT address not configured');
        await withdrawFromAave(usdtAddress, amount);
        state.totalWithdrawnUsdt += amount;
        logger.warn({ amount: amount.toString(), reason: decision.reason }, '[AutonomousAgent] EMERGENCY: Executed safety withdrawal');
        return true;
      }

      case 'supply_usdt': {
        const amount = decision.amount || ethers.parseUnits('100', 6);
        if (!usdtAddress) throw new Error('USDT address not configured');
        await supplyToAave(usdtAddress, amount);
        state.totalSuppliedUsdt += amount;
        logger.info({ amount: amount.toString(), reason: decision.reason }, '[AutonomousAgent] Executed USDT supply');
        return true;
      }

      case 'supply_xaut': {
        const amount = decision.amount || ethers.parseUnits('1', 6);
        if (!xautAddress) throw new Error('XAUT address not configured');
        await supplyToAave(xautAddress, amount);
        state.totalSuppliedXaut += amount;
        logger.info({ amount: amount.toString(), reason: decision.reason }, '[AutonomousAgent] Executed XAUT supply');
        return true;
      }

      case 'withdraw': {
        const amount = decision.amount || ethers.parseUnits('50', 6);
        if (!usdtAddress) throw new Error('USDT address not configured');
        await withdrawFromAave(usdtAddress, amount);
        state.totalWithdrawnUsdt += amount;
        logger.info({ amount: amount.toString(), reason: decision.reason }, '[AutonomousAgent] Executed withdraw');
        return true;
      }

      case 'hold':
        logger.info({ reason: decision.reason }, '[AutonomousAgent] Holding position');
        return true;

      case 'rebalance':
        logger.info({ reason: decision.reason }, '[AutonomousAgent] Rebalancing - not implemented');
        return true;

      case 'flagged':
        logger.warn({ reason: decision.reason, anomalyResult: decision.anomalyResult }, '[AutonomousAgent] Transaction flagged - requires review');
        return false;

      default:
        logger.warn({ action: decision.action }, '[AutonomousAgent] Unknown action');
        return false;
    }
  } catch (error) {
    logger.error(error, '[AutonomousAgent] Failed to execute decision');
    return false;
  }
}

async function selfHeal(): Promise<void> {
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    const cooldownMs = Math.min(60000 * state.consecutiveFailures, 300000);
    logger.warn({ cooldownMs }, '[AutonomousAgent] Cooling down after failures');
    await new Promise(resolve => setTimeout(resolve, cooldownMs));
    state.consecutiveFailures = Math.max(0, state.consecutiveFailures - 1);
  }
}

export async function runAutonomousCycle(): Promise<{
  decision: DecisionResult;
  success: boolean;
  state: AgentState;
}> {
  await selfHeal();

  const market = await getMarketData();
  state.healthFactor = market.healthFactor;

  if (market.healthFactor > 0n && market.healthFactor < 1500000000000000000n) {
    state.marketCondition = 'bearish';
  } else if (market.yieldRate > YIELD_THRESHOLD_BPS) {
    state.marketCondition = 'bullish';
  } else {
    state.marketCondition = 'neutral';
  }

  const decision = decideStrategy(market);
  const success = await executeDecision(decision);

  if (success) {
    state.consecutiveFailures = 0;
    state.lastAction = decision.action;
    state.lastActionTime = Date.now();
  } else {
    state.consecutiveFailures++;
  }

  return { decision, success, state: { ...state } };
}

export function getAgentState(): AgentState {
  return { ...state };
}

export function resetAgentState(): void {
  state = {
    lastAction: 'init',
    lastActionTime: Date.now(),
    consecutiveFailures: 0,
    totalSuppliedUsdt: 0n,
    totalSuppliedXaut: 0n,
    totalWithdrawnUsdt: 0n,
    totalWithdrawnXaut: 0n,
    healthFactor: 0n,
    previousHealthFactor: 0n,
    healthFactorVelocity: 0,
    marketCondition: 'neutral',
    strategy: 'hold',
    circuitBreakerActive: false,
    lastCircuitBreakerTime: 0
  };
}
