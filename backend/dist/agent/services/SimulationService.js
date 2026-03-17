"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulationService = void 0;
const ethers_1 = require("ethers");
const logger_1 = require("@/utils/logger");
class SimulationService {
    provider;
    constructor(rpcUrl) {
        this.provider = new ethers_1.JsonRpcProvider(rpcUrl);
    }
    /**
     * Simulates a transaction using eth_call.
     */
    async simulateTransaction(tx) {
        logger_1.logger.info({ to: tx.to }, '[SimulationService] Simulating transaction');
        try {
            const data = await this.provider.call({
                to: tx.to,
                from: tx.from || ethers_1.ethers.ZeroAddress,
                data: tx.data,
                value: tx.value || 0n,
            });
            logger_1.logger.info('[SimulationService] Simulation succeeded');
            return { success: true, data };
        }
        catch (error) {
            logger_1.logger.error(error, '[SimulationService] Simulation failed');
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
