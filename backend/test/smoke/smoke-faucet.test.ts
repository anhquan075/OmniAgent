import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

const serverAvailable = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
};

describe('[SMOKE] /api/faucet endpoints', () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await serverAvailable();
    if (!serverUp) {
      console.log('[SMOKE] Server not available - HTTP tests skipped');
    }
  });

  describe('GET /api/faucet/config', () => {
    it('returns faucet configuration', async () => {
      if (!serverUp) return;

      const res = await fetch(`${API_BASE}/api/faucet/config`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data).toHaveProperty('usdtAmount');
      expect(data).toHaveProperty('ethAmount');
      expect(data).toHaveProperty('cooldownMs');
      expect(data.usdtAmount).toBe('10000');
      expect(data.ethAmount).toBe('0.005');
    });
  });

  describe('GET /api/faucet/status/:address', () => {
    it('returns status for new address', async () => {
      if (!serverUp) return;

      const testAddress = '0x1234567890123456789012345678901234567890';
      const res = await fetch(`${API_BASE}/api/faucet/status/${testAddress}`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data).toHaveProperty('canClaim');
      expect(data).toHaveProperty('claimed');
    });

    it('returns 400 for invalid address', async () => {
      if (!serverUp) return;

      const res = await fetch(`${API_BASE}/api/faucet/status/invalid`);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/faucet/claim', () => {
    it('returns error for missing address', async () => {
      if (!serverUp) return;

      const res = await fetch(`${API_BASE}/api/faucet/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    it('returns error for invalid address format', async () => {
      if (!serverUp) return;

      const res = await fetch(`${API_BASE}/api/faucet/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: 'not-an-address' }),
      });

      expect(res.status).toBe(400);
    });
  });
});
