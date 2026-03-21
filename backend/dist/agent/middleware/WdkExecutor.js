"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WdkExecutor = void 0;
const ethers_1 = require("ethers");
const PolicyGuard_1 = require("./PolicyGuard");
const OnChainPolicyGuard_1 = require("../../services/OnChainPolicyGuard");
const NavShield_1 = require("../../services/NavShield");
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
function chainToId(chain) {
    switch (chain) {
        case 'sepolia': return 11155111;
        case 'ethereum': return 1;
        default: return 11155111;
    }
}
class WdkExecutor {
    wdk;
    constructor(wdk) {
        this.wdk = wdk;
    }
    async sendTransaction(chain, txParams, contextInfo) {
        const policyGuard = (0, PolicyGuard_1.getPolicyGuard)();
        const onChainPolicyGuard = (0, OnChainPolicyGuard_1.getOnChainPolicyGuard)();
        const amount = txParams.value ? txParams.value.toString() : (contextInfo.estimatedAmount || "0");
        const toAddress = txParams.to;
        const navResult = await (0, NavShield_1.checkNavImpact)({
            vaultAddress: env_1.env.WDK_VAULT_ADDRESS,
            inputAmount: txParams.value ? BigInt(txParams.value.toString()) : 0n,
            expectedOutputAmount: 0n,
            inputTokenPriceUsdt: ethers_1.ethers.parseUnits('1', 18),
            outputTokenPriceUsdt: 0n,
            chainId: chainToId(chain),
        });
        if (!navResult.allowed) {
            logger_1.logger.warn({ code: navResult.code, reason: navResult.reason }, '[WdkExecutor] Transaction Blocked by NAV Shield');
            throw new Error(`NAVShield Blocked: [${navResult.code}] ${navResult.reason}`);
        }
        const violation = policyGuard.validateTransaction({
            toAddress: toAddress,
            amount: amount,
            currentRiskLevel: contextInfo.riskLevel,
            portfolioValue: contextInfo.portfolioValue
        });
        if (violation.violated) {
            logger_1.logger.warn({ severity: violation.severity, reason: violation.reason }, '[WdkExecutor] Transaction Blocked by PolicyGuard');
            throw new Error(`PolicyGuard Blocked Transaction: [${violation.severity}] ${violation.reason}`);
        }
        if (onChainPolicyGuard.isEnabled()) {
            const portfolioValueUsdt = contextInfo.portfolioValue
                ? ethers_1.ethers.parseUnits(contextInfo.portfolioValue, 18)
                : 0n;
            const amountUsdt = ethers_1.ethers.parseUnits(amount || '0', 6);
            const onChainResult = await onChainPolicyGuard.validate(toAddress, amountUsdt, portfolioValueUsdt);
            if (!onChainResult.approved) {
                logger_1.logger.warn({
                    reason: onChainResult.reason,
                    onChain: onChainResult.onChain,
                    error: onChainResult.error
                }, '[WdkExecutor] Transaction Blocked by On-Chain PolicyGuard');
                throw new Error(`OnChainPolicyGuard Blocked: ${onChainResult.reason}`);
            }
            logger_1.logger.info('[WdkExecutor] On-chain PolicyGuard validation passed');
        }
        const account = await this.wdk.getAccount(chain);
        logger_1.logger.info('[WdkExecutor] Transaction passed all PolicyGuard checks. Sending...');
        const tx = await account.sendTransaction(txParams);
        policyGuard.recordTransaction(amount, toAddress);
        if (onChainPolicyGuard.isEnabled()) {
            const amountUsdt = ethers_1.ethers.parseUnits(amount || '0', 6);
            await onChainPolicyGuard.commit(amountUsdt);
        }
        return tx;
    }
}
exports.WdkExecutor = WdkExecutor;
