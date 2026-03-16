"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WdkExecutor = void 0;
const PolicyGuard_1 = require("./PolicyGuard");
class WdkExecutor {
    wdk;
    constructor(wdk) {
        this.wdk = wdk;
    }
    async sendTransaction(chain, txParams, contextInfo) {
        const policyGuard = (0, PolicyGuard_1.getPolicyGuard)();
        const amount = txParams.value ? txParams.value.toString() : (contextInfo.estimatedAmount || "0");
        const toAddress = txParams.to;
        // 1. Strict recipient whitelisting & transaction validation
        const violation = policyGuard.validateTransaction({
            toAddress: toAddress,
            amount: amount,
            currentRiskLevel: contextInfo.riskLevel,
            portfolioValue: contextInfo.portfolioValue
        });
        if (violation.violated) {
            console.warn(`[WdkExecutor] 🚫 Transaction Blocked by PolicyGuard: ${violation.reason}`);
            throw new Error(`PolicyGuard Blocked Transaction: [${violation.severity}] ${violation.reason}`);
        }
        const account = await this.wdk.getAccount(chain);
        // Proceed with the real WDK transaction
        console.log(`[WdkExecutor] ✅ Transaction passed PolicyGuard. Sending...`);
        const tx = await account.sendTransaction(txParams);
        // Record the successful transaction to update daily volume and limits
        policyGuard.recordTransaction(amount, toAddress);
        return tx;
    }
}
exports.WdkExecutor = WdkExecutor;
