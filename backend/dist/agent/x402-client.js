"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.X402Client = void 0;
const WdkExecutor_1 = require("./middleware/WdkExecutor");
const ethers_1 = require("../contracts/clients/ethers");
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
        console.log(`[X402Client] Requesting gated service: ${serviceUrl}`);
        console.log(`[X402Client] Paying ${amount} USD₮ to ${providerAddress}...`);
        const wdkExecutor = new WdkExecutor_1.WdkExecutor(this.wdk);
        const { usdt } = (0, ethers_1.getContracts)();
        // Execute Transfer using WdkExecutor (which enforces PolicyGuard)
        const tx = await wdkExecutor.sendTransaction('bnb', {
            to: this.usdtAddress,
            data: usdt.interface.encodeFunctionData("transfer", [providerAddress, amount])
        }, { riskLevel: currentRiskLevel, portfolioValue: portfolioValue, estimatedAmount: amount });
        console.log(`[X402Client] Payment Sent! Proof (Hash): ${tx.hash}`);
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
