"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAgentReasoning = updateAgentReasoning;
exports.updateX402Revenue = updateX402Revenue;
exports.addRecentAction = addRecentAction;
exports.getAgentLiveData = getAgentLiveData;
const hono_1 = require("hono");
const ethers_1 = require("../../contracts/clients/ethers");
const ethers_2 = require("ethers");
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
// In-memory store for live agent data (shared across requests)
const agentLiveData = {
    lastReasoning: '',
    lastThought: '',
    x402Revenue: '0.00',
    recentActions: [],
    maxActions: 20
};
function updateAgentReasoning(reasoning) {
    agentLiveData.lastReasoning = reasoning;
    agentLiveData.lastThought = reasoning;
}
function updateX402Revenue(amount) {
    agentLiveData.x402Revenue = amount;
}
function addRecentAction(action) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    agentLiveData.recentActions.unshift({ ...action, time });
    if (agentLiveData.recentActions.length > agentLiveData.maxActions) {
        agentLiveData.recentActions.pop();
    }
}
function getAgentLiveData() {
    return { ...agentLiveData };
}
const stats = new hono_1.Hono();
stats.get('/', async (c) => {
    try {
        logger_1.logger.debug('[Stats] Fetching data from contracts');
        const { vault, zkOracle, breaker, engine, usdt } = (0, ethers_1.getContracts)();
        // Fetch in parallel with individual error handling
        const [totalAssets, bufferStatus, riskMetrics, isPaused, executionStatus, preview, usdtBalance] = await Promise.all([
            vault.totalAssets().catch((e) => { logger_1.logger.error(e, "vault.totalAssets error"); return 0n; }),
            vault.bufferStatus().catch((e) => { logger_1.logger.error(e, "vault.bufferStatus error"); return { utilizationBps: 0n, current: 0n, target: 0n }; }),
            zkOracle.getVerifiedRiskBands().catch((e) => {
                logger_1.logger.error(e, "zkOracle.getVerifiedRiskBands error");
                return {
                    monteCarloDrawdownBps: 0,
                    verifiedSharpeRatio: 0,
                    timestamp: Math.floor(Date.now() / 1000),
                    recommendedBufferBps: 500
                };
            }),
            breaker.isPaused().catch((e) => { logger_1.logger.error(e, "breaker.isPaused error"); return false; }),
            engine.canExecute().catch((e) => { logger_1.logger.error(e, "engine.canExecute error"); return [false, "0x00"]; }),
            engine.previewDecision().catch((e) => { logger_1.logger.error(e, "engine.previewDecision error"); return { targetWDKBps: 0n, state: 0n }; }),
            usdt.balanceOf(env_1.env.WDK_VAULT_ADDRESS).catch((e) => { logger_1.logger.error(e, "usdt.balanceOf error"); return 0n; })
        ]);
        logger_1.logger.debug('[Stats] Formatting response');
        const [canExecute, executeReason] = executionStatus || [false, "0x00"];
        // USDT has 6 decimals
        const USDT_DECIMALS = 6;
        // Format results
        const response = {
            vault: {
                totalAssets: ethers_2.ethers.formatUnits(totalAssets || 0n, USDT_DECIMALS),
                bufferUtilizationBps: (bufferStatus?.utilizationBps || 0n).toString(),
                bufferCurrent: ethers_2.ethers.formatUnits(bufferStatus?.current || 0n, USDT_DECIMALS),
                bufferTarget: ethers_2.ethers.formatUnits(bufferStatus?.target || 0n, USDT_DECIMALS),
                usdtBalance: ethers_2.ethers.formatUnits(usdtBalance || 0n, USDT_DECIMALS)
            },
            risk: {
                level: Number(riskMetrics?.monteCarloDrawdownBps || 0) >= 2000 ? 'HIGH' : Number(riskMetrics?.monteCarloDrawdownBps || 0) >= 1000 ? 'MEDIUM' : 'LOW',
                drawdownBps: Number(riskMetrics?.monteCarloDrawdownBps || 0),
                sharpe: Number(riskMetrics?.verifiedSharpeRatio || 0) / 100,
                timestamp: Number(riskMetrics?.timestamp || 0)
            },
            system: {
                isPaused: !!isPaused,
                canExecute: !!canExecute,
                executeReason: typeof executeReason === 'string' && executeReason.startsWith('0x') && executeReason.length > 2
                    ? (executeReason.startsWith('0x0000') || executeReason === '0x00' ? 'NONE' : (function () { try {
                        return ethers_2.ethers.decodeBytes32String(executeReason);
                    }
                    catch {
                        return 'UNKNOWN';
                    } })())
                    : 'UNKNOWN',
                targetWDKBps: Number(preview?.targetWDKBps || 0n),
                state: Number(preview?.state || 0n)
            },
            lastReasoning: agentLiveData.lastReasoning,
            lastThought: agentLiveData.lastThought,
            x402Revenue: agentLiveData.x402Revenue,
            recentActions: agentLiveData.recentActions,
            timestamp: Date.now()
        };
        return c.json(response);
    }
    catch (error) {
        logger_1.logger.error(error, "Stats Error (Fatal)");
        return c.json({ error: error.message }, 500);
    }
});
exports.default = stats;
