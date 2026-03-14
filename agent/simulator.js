import { ethers } from 'ethers';

export class SimulationService {
  constructor(rpcUrl) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Simulates a transaction using eth_call.
   * Returns an object { success: boolean, data?: string, error?: string }
   */
  async simulateTransaction(tx) {
    console.error(`[Simulator] Simulating transaction to ${tx.to}...`);
    try {
      // Use eth_call to dry-run the transaction
      const data = await this.provider.call({
        to: tx.to,
        from: tx.from || ethers.ZeroAddress,
        data: tx.data,
        value: tx.value || 0n,
      });
      
      console.error(`[Simulator] Simulation succeeded.`);
      return { success: true, data };
    } catch (error) {
      console.error(`[Simulator] Simulation failed! Reason: ${error.message}`);
      // Try to extract revert reason if possible
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
