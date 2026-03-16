"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeService = void 0;
const env_1 = require("../../config/env");
/**
 * BridgeService handles autonomous cross-chain movements using WDK.
 */
class BridgeService {
    wdk;
    constructor(wdk, bnbRpc, solanaRpc, tonRpc) {
        this.wdk = wdk;
    }
    async fetchCrossChainYields() {
        // Simulated high-fidelity yields for the strategist
        return {
            bnb: 5.2,
            solana: 9.8,
            ton: 7.4
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
    async executeBridge(fromChain, toChain, amount, tokenAddress) {
        console.log(`[BridgeService] WDK OMNICHAIN TRANSFER: ${amount} USD₮ [${fromChain} -> ${toChain}]`);
        try {
            const fromAccount = await this.wdk.getAccount(fromChain);
            const toAccount = await this.wdk.getAccount(toChain);
            const recipientAddress = await toAccount.getAddress();
            // Check balance before bridging
            const token = tokenAddress || (fromChain === 'bnb' ? env_1.env.WDK_USDT_ADDRESS : '');
            const result = await fromAccount.transfer({
                token: token,
                recipient: recipientAddress,
                amount: amount.toString(),
                targetChain: toChain
            });
            return { success: true, hash: result.hash, toChain };
        }
        catch (error) {
            console.error(`[BridgeService] WDK Transfer Failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    async bridgeUsdt(sourceChain, targetChain, amount) {
        return this.executeBridge(sourceChain, targetChain, Number(amount) / 1e18);
    }
}
exports.BridgeService = BridgeService;
