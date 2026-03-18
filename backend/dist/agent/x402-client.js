"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.X402Client = void 0;
const WdkExecutor_1 = require("./middleware/WdkExecutor");
const ethers_1 = require("../contracts/clients/ethers");
const logger_1 = require("../utils/logger");
/**
 * X402Client handles machine-to-machine payments for infrastructure.
 */
class X402Client {
    wdk;
    usdtAddress;
    constructor(wdk, usdtAddress) {
        this.wdk = wdk;
        this.usdtAddress = usdtAddress;
    }
    async payAndFetch(serviceUrl, providerAddress, amount, currentRiskLevel, portfolioValue) {
        logger_1.logger.info({ serviceUrl }, '[X402Client] Requesting gated service');
        logger_1.logger.info({ amount, providerAddress }, '[X402Client] Paying USD₮ to provider...');
        const wdkExecutor = new WdkExecutor_1.WdkExecutor(this.wdk);
        const { usdt } = (0, ethers_1.getContracts)();
        // Execute Transfer using WdkExecutor (which enforces PolicyGuard)
        const tx = await wdkExecutor.sendTransaction('bnb', {
            to: this.usdtAddress,
            data: usdt.interface.encodeFunctionData("transfer", [providerAddress, amount])
        }, { riskLevel: currentRiskLevel, portfolioValue: portfolioValue, estimatedAmount: amount });
        logger_1.logger.info({ hash: tx.hash }, '[X402Client] Payment Sent!');
        // Call Gated API with Proof
        const response = await fetch(serviceUrl, {
            method: 'GET',
            headers: {
                'Authorization': `x402 ${tx.hash}`,
                'X-402-Payment-Hash': tx.hash
            }
        });
        if (response.status === 402) {
            throw new Error("Payment Required (x402 error)");
        }
        return await response.json();
    }
}
exports.X402Client = X402Client;
