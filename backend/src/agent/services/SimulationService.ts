import { ethers, JsonRpcProvider } from 'ethers';

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
    console.log(`[SimulationService] Simulating transaction to ${tx.to}...`);
    try {
      const data = await this.provider.call({
        to: tx.to,
        from: tx.from || ethers.ZeroAddress,
        data: tx.data,
        value: tx.value || 0n,
      });
      
      console.log(`[SimulationService] Simulation succeeded.`);
      return { success: true, data };
    } catch (error: any) {
      console.error(`[SimulationService] Simulation failed! Reason: ${error.message}`);
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
