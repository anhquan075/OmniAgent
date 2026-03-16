"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const ethers_1 = require("../../contracts/clients/ethers");
const ethers_2 = require("ethers");
const env_1 = require("../../config/env");
const stats = new hono_1.Hono();
stats.get('/', async (c) => {
    try {
        console.log("[Stats] Fetching data from contracts...");
        const { vault, zkOracle, breaker, engine, usdt } = (0, ethers_1.getContracts)();
        // Fetch in parallel with individual error handling
        const [totalAssets, bufferStatus, riskMetrics, isPaused, executionStatus, preview, usdtBalance] = await Promise.all([
            vault.totalAssets().catch((e) => { console.error("vault.totalAssets error:", e.message); return 0n; }),
            vault.bufferStatus().catch((e) => { console.error("vault.bufferStatus error:", e.message); return { utilizationBps: 0n, current: 0n, target: 0n }; }),
            zkOracle.getVerifiedRiskBands().catch((e) => {
                console.error("zkOracle.getVerifiedRiskBands error:", e.message);
                return {
                    monteCarloDrawdownBps: 0,
                    verifiedSharpeRatio: 0,
                    timestamp: Math.floor(Date.now() / 1000),
                    recommendedBufferBps: 500
                };
            }),
            breaker.isPaused().catch((e) => { console.error("breaker.isPaused error:", e.message); return false; }),
            engine.canExecute().catch((e) => { console.error("engine.canExecute error:", e.message); return [false, "0x00"]; }),
            engine.previewDecision().catch((e) => { console.error("engine.previewDecision error:", e.message); return { targetWDKBps: 0n, state: 0n }; }),
            usdt.balanceOf(env_1.env.WDK_VAULT_ADDRESS).catch((e) => { console.error("usdt.balanceOf error:", e.message); return 0n; })
        ]);
        console.log("[Stats] Formatting response...");
        const [canExecute, executeReason] = executionStatus || [false, "0x00"];
        // Format results
        const response = {
            vault: {
                totalAssets: ethers_2.ethers.formatUnits(totalAssets || 0n, 18),
                bufferUtilizationBps: (bufferStatus?.utilizationBps || 0n).toString(),
                bufferCurrent: ethers_2.ethers.formatUnits(bufferStatus?.current || 0n, 18),
                bufferTarget: ethers_2.ethers.formatUnits(bufferStatus?.target || 0n, 18),
                usdtBalance: ethers_2.ethers.formatUnits(usdtBalance || 0n, 18)
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
            timestamp: Date.now()
        };
        return c.json(response);
    }
    catch (error) {
        console.error("Stats Error (Fatal):", error);
        return c.json({ error: error.message }, 500);
    }
});
exports.default = stats;
