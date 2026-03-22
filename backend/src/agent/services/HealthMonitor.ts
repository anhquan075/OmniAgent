import { ethers } from 'ethers';
import { env } from '@/config/env';

export interface HealthFactorAlert {
  type: 'warning' | 'critical' | 'emergency';
  healthFactor: number;
  timestamp: Date;
  message: string;
  recommendedAction: string;
}

export interface PositionData {
  supplied: bigint;
  borrowed: bigint;
  healthFactor: bigint;
  availableBorrows: bigint;
  liquidationThreshold: bigint;
}

export class AaveHealthMonitor {
  private provider: ethers.JsonRpcProvider;
  private aaveAdapterAddress: string;
  private alertHistory: HealthFactorAlert[] = [];
  private readonly WARNING_THRESHOLD = 1.5;
  private readonly CRITICAL_THRESHOLD = 1.2;
  private readonly EMERGENCY_THRESHOLD = 1.1;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
    this.aaveAdapterAddress = env.WDK_AAVE_ADAPTER_ADDRESS || '';
  }

  async getPositionData(userAddress: string): Promise<PositionData | null> {
    if (!this.aaveAdapterAddress) {
      console.warn('Aave adapter address not configured - skipping position check');
      return null;
    }

    try {
      const adapterAbi = [
        'function getUserAccountData(address) view returns (uint256, uint256, uint256, uint256, uint256, uint256)',
        'function getHealthFactor() view returns (uint256)'
      ];

      const adapter = new ethers.Contract(this.aaveAdapterAddress, adapterAbi, this.provider);
      const data = await adapter.getUserAccountData(userAddress);
      const healthFactor = await adapter.getHealthFactor();

      const hasNoPosition = data[2] === 0n && data[1] === 0n && healthFactor === 0n;
      if (hasNoPosition) {
        return null;
      }

      return {
        supplied: data[2],
        borrowed: data[1],
        healthFactor,
        availableBorrows: data[3],
        liquidationThreshold: data[4]
      };
    } catch (error) {
      const isContractRevert = error instanceof Error && 
        (error.message.includes('revert') || error.message.includes('CALL_EXCEPTION'));
      
      if (!isContractRevert) {
        console.error('Failed to get Aave position data:', error);
      }
      return null;
    }
  }

  checkHealthFactor(healthFactor: bigint): HealthFactorAlert | null {
    const hf = Number(ethers.formatEther(healthFactor));

    if (hf < this.EMERGENCY_THRESHOLD) {
      return {
        type: 'emergency',
        healthFactor: hf,
        timestamp: new Date(),
        message: `CRITICAL: Health factor ${hf.toFixed(3)} - Immediate liquidation risk!`,
        recommendedAction: 'Execute emergency withdraw or add collateral immediately'
      };
    }

    if (hf < this.CRITICAL_THRESHOLD) {
      return {
        type: 'critical',
        healthFactor: hf,
        timestamp: new Date(),
        message: `WARNING: Health factor ${hf.toFixed(3)} - High liquidation risk`,
        recommendedAction: 'Consider partial withdraw or adding collateral'
      };
    }

    if (hf < this.WARNING_THRESHOLD) {
      return {
        type: 'warning',
        healthFactor: hf,
        timestamp: new Date(),
        message: `NOTICE: Health factor ${hf.toFixed(3)} - Monitor closely`,
        recommendedAction: 'Review position and consider risk management'
      };
    }

    return null;
  }

  async monitorPosition(userAddress: string): Promise<HealthFactorAlert | null> {
    const position = await this.getPositionData(userAddress);
    if (!position) {
      return null;
    }

    const alert = this.checkHealthFactor(position.healthFactor);
    if (alert) {
      this.alertHistory.push(alert);
    }

    return alert;
  }

  async getRecommendedAction(userAddress: string): Promise<string> {
    const position = await this.getPositionData(userAddress);
    if (!position) return 'No active Aave position found';

    const hf = Number(ethers.formatEther(position.healthFactor));
    
    if (hf < 1.2) {
      const suppliedValue = Number(ethers.formatEther(position.supplied));
      const targetHF = 1.5;
      const withdrawRatio = 1 - (hf / targetHF);
      const withdrawAmount = suppliedValue * withdrawRatio;
      
      return `Withdraw ${withdrawAmount.toFixed(2)} USDT to reach health factor of ${targetHF}`;
    }

    if (hf < 1.5) {
      return 'Consider adding collateral or reducing borrowed position';
    }

    return 'Position is healthy';
  }

  getAlertHistory(limit: number = 10): HealthFactorAlert[] {
    return this.alertHistory.slice(-limit);
  }

  clearAlertHistory(): void {
    this.alertHistory = [];
  }
}

export const healthMonitor = new AaveHealthMonitor();
