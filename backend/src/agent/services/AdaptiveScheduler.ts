import { logger } from '@/utils/logger';
import { getAaveAccountData } from '@/services/WdkProtocolService';

export interface AgentState {
  healthFactor: bigint;
  lastActionTime: number;
  consecutiveFailures: number;
}

export interface SchedulerConfig {
  highAlertIntervalMs: number;
  moderateIntervalMs: number;
  stableIntervalMs: number;
  volatilityHighThreshold: number;
  volatilityModerateThreshold: number;
  healthFactorDangerThreshold: bigint;
  healthFactorWarningThreshold: bigint;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  highAlertIntervalMs: 30_000,
  moderateIntervalMs: 5 * 60_000,
  stableIntervalMs: 60 * 60_000,
  volatilityHighThreshold: 0.05,
  volatilityModerateThreshold: 0.02,
  healthFactorDangerThreshold: 1500000000000000000n,
  healthFactorWarningThreshold: 2000000000000000000n,
};

export class AdaptiveScheduler {
  private config: SchedulerConfig;
  private historicalVolatility: number[] = [];
  private maxHistorySize: number = 100;

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async calculateVolatility(): Promise<number> {
    try {
      const aaveData = await getAaveAccountData();
      const utilization = aaveData.totalDebtBase > 0n
        ? Number(aaveData.totalDebtBase) / Number(aaveData.totalCollateralBase)
        : 0;
      
      const healthFactorVolatility = aaveData.healthFactor > 0n
        ? Math.abs(Number(aaveData.healthFactor) - Number(2000000000000000000n)) / Number(2000000000000000000n)
        : 0;

      const volatility = (utilization + healthFactorVolatility) / 2;
      
      this.addToHistory(volatility);
      
      return volatility;
    } catch (error) {
      logger.warn({ error }, '[AdaptiveScheduler] Failed to calculate volatility');
      return this.getHistoricalAverage();
    }
  }

  async suggestInterval(state: AgentState): Promise<number> {
    const volatility = await this.calculateVolatility();
    
    const healthFactorStatus = this.getHealthFactorStatus(state.healthFactor);
    
    if (volatility > this.config.volatilityHighThreshold || healthFactorStatus === 'danger') {
      logger.info({ 
        volatility, 
        healthFactorStatus, 
        interval: this.config.highAlertIntervalMs 
      }, '[AdaptiveScheduler] High alert mode');
      return this.config.highAlertIntervalMs;
    }
    
    if (volatility > this.config.volatilityModerateThreshold || healthFactorStatus === 'warning') {
      logger.info({ 
        volatility, 
        healthFactorStatus, 
        interval: this.config.moderateIntervalMs 
      }, '[AdaptiveScheduler] Moderate mode');
      return this.config.moderateIntervalMs;
    }
    
    logger.info({ 
      volatility, 
      healthFactorStatus, 
      interval: this.config.stableIntervalMs 
    }, '[AdaptiveScheduler] Stable mode');
    return this.config.stableIntervalMs;
  }

  private getHealthFactorStatus(healthFactor: bigint): 'danger' | 'warning' | 'safe' {
    if (healthFactor < this.config.healthFactorDangerThreshold) {
      return 'danger';
    }
    if (healthFactor < this.config.healthFactorWarningThreshold) {
      return 'warning';
    }
    return 'safe';
  }

  private addToHistory(volatility: number): void {
    this.historicalVolatility.push(volatility);
    if (this.historicalVolatility.length > this.maxHistorySize) {
      this.historicalVolatility.shift();
    }
  }

  private getHistoricalAverage(): number {
    if (this.historicalVolatility.length === 0) {
      return this.config.volatilityModerateThreshold;
    }
    const sum = this.historicalVolatility.reduce((a, b) => a + b, 0);
    return sum / this.historicalVolatility.length;
  }

  getVolatilityStats(): {
    current: number;
    average: number;
    max: number;
    min: number;
    sampleSize: number;
  } {
    const current = this.historicalVolatility[this.historicalVolatility.length - 1] || 0;
    const average = this.getHistoricalAverage();
    const max = Math.max(...this.historicalVolatility, 0);
    const min = Math.min(...this.historicalVolatility, 0);
    
    return {
      current,
      average,
      max,
      min,
      sampleSize: this.historicalVolatility.length
    };
  }

  updateConfig(updates: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info({ config: this.config }, '[AdaptiveScheduler] Config updated');
  }

  getConfig(): SchedulerConfig {
    return { ...this.config };
  }
}

let globalScheduler: AdaptiveScheduler | null = null;

export function getAdaptiveScheduler(): AdaptiveScheduler {
  if (!globalScheduler) {
    globalScheduler = new AdaptiveScheduler();
  }
  return globalScheduler;
}
