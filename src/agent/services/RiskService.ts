import { ethers, BaseContract, Contract } from 'ethers';
import WDK from '@tetherto/wdk';

export interface RiskProfile {
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  drawdownBps: number;
  sharpe: number;
  recommendedBuffer: number;
  timestamp: number;
}

export class RiskService {
  private zkOracle: Contract;
  private breaker: Contract;
  private wdk: WDK;

  // Thresholds
  private readonly HIGH_RISK_DRAWDOWN_BPS = 2000; // 20% expected drawdown
  private readonly MEDIUM_RISK_DRAWDOWN_BPS = 1000; // 10% expected drawdown

  constructor(zkOracleContract: Contract, circuitBreakerContract: Contract, wdk: WDK) {
    this.zkOracle = zkOracleContract;
    this.breaker = circuitBreakerContract;
    this.wdk = wdk;
  }

  async getRiskProfile(): Promise<RiskProfile> {
    const metrics = await this.zkOracle.getVerifiedRiskBands();
    const drawdown = Number(metrics.monteCarloDrawdownBps);
    
    let level: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (drawdown >= this.HIGH_RISK_DRAWDOWN_BPS) level = 'HIGH';
    else if (drawdown >= this.MEDIUM_RISK_DRAWDOWN_BPS) level = 'MEDIUM';

    return {
      level,
      drawdownBps: drawdown,
      sharpe: Number(metrics.verifiedSharpeRatio),
      recommendedBuffer: Number(metrics.recommendedBufferBps),
      timestamp: Number(metrics.timestamp)
    };
  }

  async evaluateSafetyAction(currentProfile: RiskProfile) {
    if (currentProfile.level === 'HIGH') {
      return {
        action: 'PAUSE_AND_PROTECT',
        reason: `High risk detected: ${currentProfile.drawdownBps} bps drawdown proven by ZK.`
      };
    }
    
    if (currentProfile.level === 'MEDIUM') {
      return {
        action: 'REBALANCE_TO_GOLD',
        reason: `Medium risk detected: ${currentProfile.drawdownBps} bps drawdown. Pivoting to XAU₮.`
      };
    }

    return { action: 'NONE', reason: 'Risk levels within normal bounds.' };
  }

  async triggerEmergencyPause(reason: string) {
    console.log(`!!! EMERGENCY PAUSE TRIGGERED !!!`);
    console.log(`Reason: ${reason}`);

    const bnbAccount = await this.wdk.getAccount('bnb');
    
    // bytes4(keccak256("pause()"))
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
