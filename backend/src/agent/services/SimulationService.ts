import { ethers, JsonRpcProvider } from 'ethers';
import { logger } from '@/utils/logger';

export interface SimulationResult {
  success: boolean;
  data?: string;
  error?: string;
}

export class SimulationService {
  private provider: JsonRpcProvider;

  constructor(rpcUrl: string) {
    this.provider = new JsonRpcProvider(rpcUrl);
  }

  /**
   * Simulates a transaction using eth_call.
   */
  async simulateTransaction(tx: { to: string; from?: string; data: string; value?: bigint }): Promise<SimulationResult> {
    logger.info({ to: tx.to }, '[SimulationService] Simulating transaction');
    try {
      const data = await this.provider.call({
        to: tx.to,
        from: tx.from || ethers.ZeroAddress,
        data: tx.data,
        value: tx.value || 0n,
      });
      
      logger.info('[SimulationService] Simulation succeeded');
      return { success: true, data };
    } catch (error: any) {
      logger.error(error, '[SimulationService] Simulation failed');
      let reason = 'Unknown revert';
      if (error.data) {
        reason = error.data;
      } else if (error.reason) {
        reason = error.reason;
      }
      return { success: false, error: reason };
    }
  }
}
