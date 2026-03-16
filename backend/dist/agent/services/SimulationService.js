"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulationService = void 0;
const ethers_1 = require("ethers");
class SimulationService {
    provider;
    constructor(rpcUrl) {
        this.provider = new ethers_1.JsonRpcProvider(rpcUrl);
    }
    /**
     * Simulates a transaction using eth_call.
     */
    async simulateTransaction(tx) {
        console.log(`[SimulationService] Simulating transaction to ${tx.to}...`);
        try {
            const data = await this.provider.call({
                to: tx.to,
                from: tx.from || ethers_1.ethers.ZeroAddress,
                data: tx.data,
                value: tx.value || 0n,
            });
            console.log(`[SimulationService] Simulation succeeded.`);
            return { success: true, data };
        }
        catch (error) {
            console.error(`[SimulationService] Simulation failed! Reason: ${error.message}`);
            let reason = 'Unknown revert';
            if (error.data) {
                reason = error.data;
            }
            else if (error.reason) {
                reason = error.reason;
            }
            return { success: false, error: reason };
        }
    }
}
exports.SimulationService = SimulationService;
