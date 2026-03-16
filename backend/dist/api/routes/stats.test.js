"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const stats_1 = __importDefault(require("./stats"));
const hono_1 = require("hono");
// Mock getContracts
vitest_1.vi.mock('@/contracts/clients/ethers', () => ({
    getContracts: () => ({
        vault: {
            totalAssets: vitest_1.vi.fn().mockResolvedValue(1000000000000000000000n), // 1000
            bufferStatus: vitest_1.vi.fn().mockResolvedValue({
                utilizationBps: 5000,
                current: 500000000000000000000n,
                target: 500000000000000000000n
            }),
            getAddress: vitest_1.vi.fn().mockResolvedValue('0xVault')
        },
        zkOracle: {
            getVerifiedRiskBands: vitest_1.vi.fn().mockResolvedValue({
                monteCarloDrawdownBps: 500,
                verifiedSharpeRatio: 350,
                recommendedBufferBps: 1000,
                timestamp: 123456789
            })
        },
        breaker: {
            isPaused: vitest_1.vi.fn().mockResolvedValue(false)
        },
        engine: {
            canExecute: vitest_1.vi.fn().mockResolvedValue([true, '0x' + '0'.repeat(64)]),
            previewDecision: vitest_1.vi.fn().mockResolvedValue({
                state: 1,
                targetWDKBps: 2000,
                bountyBps: 10
            })
        },
        usdt: {
            balanceOf: vitest_1.vi.fn().mockResolvedValue(500000000000000000000n)
        }
    })
}));
(0, vitest_1.describe)('Stats API', () => {
    const testApp = new hono_1.Hono().route('/api/stats', stats_1.default);
    (0, vitest_1.it)('should return 200 and correctly formatted stats', async () => {
        const res = await testApp.request('/api/stats');
        (0, vitest_1.expect)(res.status).toBe(200);
        const data = await res.json();
        (0, vitest_1.expect)(data.vault.totalAssets).toBe('1000.0');
        (0, vitest_1.expect)(data.risk.level).toBe('LOW');
        (0, vitest_1.expect)(data.system.isPaused).toBe(false);
    });
});
