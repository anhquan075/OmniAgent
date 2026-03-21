"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeService = void 0;
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
const WdkProtocolService_1 = require("../../services/WdkProtocolService");
const CHAIN_ID_MAP = {
    '1': 'ethereum',
    '42161': 'arbitrum',
    '10': 'optimism',
    '137': 'polygon',
    '80094': 'berachain',
    '57073': 'ink',
    '9745': 'plasma',
    '1030': 'conflux',
    '21000000': 'corn',
    '43114': 'avalanche',
    '42220': 'celo',
    '14': 'flare',
    '999': 'hyperevm',
    '5000': 'mantle',
    '4326': 'megaeth',
    '143': 'monad',
    '2818': 'morph',
    '30': 'rootstock',
    '1329': 'sei',
    '988': 'stable',
    '130': 'unichain',
    '196': 'xlayer',
    '30168': 'solana',
    '30343': 'ton',
    '30420': 'tron',
    '11155111': 'sepolia'
};
class BridgeService {
    wdk;
    constructor(wdk, sepoliaRpc) {
        this.wdk = wdk;
    }
    async fetchCrossChainYields() {
        return {
            sepolia: 4.85
        };
    }
    async analyzeBridgeOpportunity(currentChain, threshold = 2.0) {
        const yields = await this.fetchCrossChainYields();
        const currentYield = yields[currentChain] || 0;
        let bestChain = currentChain;
        let bestYield = currentYield;
        for (const [chain, chainYield] of Object.entries(yields)) {
            const y = chainYield;
            if (y - currentYield >= threshold && y > bestYield) {
                bestYield = y;
                bestChain = chain;
            }
        }
        if (bestChain !== currentChain) {
            return { shouldBridge: true, targetChain: bestChain, expectedYield: bestYield };
        }
        return { shouldBridge: false };
    }
    async getBridgeQuote(sourceChain, targetChain, amountUsdt, recipient) {
        const sourceChainName = CHAIN_ID_MAP[sourceChain] || sourceChain;
        const targetChainName = CHAIN_ID_MAP[targetChain] || targetChain;
        const token = env_1.env.WDK_USDT_ADDRESS;
        if (!token) {
            return { success: false, error: 'WDK_USDT_ADDRESS not configured' };
        }
        try {
            const quote = await (0, WdkProtocolService_1.quoteBridgeUsdt0)(targetChainName, recipient, token, amountUsdt);
            return {
                success: true,
                fee: quote.fee.toString(),
                bridgeFee: quote.bridgeFee.toString(),
                targetChain: targetChainName
            };
        }
        catch (error) {
            logger_1.logger.error({ error: error.message, targetChain }, '[BridgeService] Quote failed');
            return { success: false, error: error.message };
        }
    }
    async executeBridge(sourceChain, targetChain, amountUsdt, recipient) {
        const sourceChainName = CHAIN_ID_MAP[sourceChain] || sourceChain;
        const targetChainName = CHAIN_ID_MAP[targetChain] || targetChain;
        const tokenAddress = env_1.env.WDK_USDT_ADDRESS || '';
        if (!tokenAddress) {
            return { success: false, error: 'WDK_USDT_ADDRESS not configured' };
        }
        let recipientAddress = recipient ?? '';
        if (!recipientAddress) {
            const toAccount = await this.wdk.getAccount(targetChainName);
            recipientAddress = await toAccount.getAddress();
        }
        logger_1.logger.info({ amount: amountUsdt.toString(), sourceChain: sourceChainName, targetChain: targetChainName }, '[BridgeService] WDK bridge execution');
        try {
            const result = await (0, WdkProtocolService_1.bridgeUsdt0)(targetChainName, recipientAddress, tokenAddress, amountUsdt);
            return {
                success: true,
                hash: result.hash,
                approveHash: result.approveHash,
                bridgeFee: result.bridgeFee.toString(),
                totalFee: result.fee.toString(),
                targetChain: targetChainName
            };
        }
        catch (error) {
            logger_1.logger.error({ error: error.message, targetChain }, '[BridgeService] Bridge failed');
            return { success: false, error: error.message };
        }
    }
    async bridgeUsdt(sourceChain, targetChain, amountUsdt, recipient) {
        return this.executeBridge(sourceChain, targetChain, amountUsdt, recipient);
    }
    isValidChain(chain) {
        const chainName = CHAIN_ID_MAP[chain] || chain;
        return WdkProtocolService_1.SUPPORTED_CHAINS.includes(chainName) || ['solana', 'ton', 'tron'].includes(chainName);
    }
    getSupportedChains() {
        return [...WdkProtocolService_1.SUPPORTED_CHAINS, 'solana', 'ton', 'tron'];
    }
}
exports.BridgeService = BridgeService;
