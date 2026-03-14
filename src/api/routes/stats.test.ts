import { describe, it, expect, vi } from 'vitest';
import app from '@/index'; // We might need to export app from index.ts
import statsRoute from './stats';
import { Hono } from 'hono';

// Mock getContracts
vi.mock('@/contracts/clients/ethers', () => ({
  getContracts: () => ({
    vault: {
      totalAssets: vi.fn().mockResolvedValue(1000000000000000000000n), // 1000
      bufferStatus: vi.fn().mockResolvedValue({
        utilizationBps: 5000,
        current: 500000000000000000000n,
        target: 500000000000000000000n
      }),
      getAddress: vi.fn().mockResolvedValue('0xVault')
    },
    zkOracle: {
      getVerifiedRiskBands: vi.fn().mockResolvedValue({
        monteCarloDrawdownBps: 500,
        verifiedSharpeRatio: 350,
        recommendedBufferBps: 1000,
        timestamp: 123456789
      })
    },
    breaker: {
      isPaused: vi.fn().mockResolvedValue(false)
    },
    engine: {
      canExecute: vi.fn().mockResolvedValue([true, '0x' + '0'.repeat(64)]),
      previewDecision: vi.fn().mockResolvedValue({
        state: 1,
        targetAsterBps: 2000,
        bountyBps: 10
      })
    },
    usdt: {
      balanceOf: vi.fn().mockResolvedValue(500000000000000000000n)
    }
  })
}));

describe('Stats API', () => {
  const testApp = new Hono().route('/api/stats', statsRoute);

  it('should return 200 and correctly formatted stats', async () => {
    const res = await testApp.request('/api/stats');
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.vault.totalAssets).toBe('1000.0');
    expect(data.risk.level).toBe('LOW');
    expect(data.system.isPaused).toBe(false);
  });
});
