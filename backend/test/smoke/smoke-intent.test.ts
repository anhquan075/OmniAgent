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

const TEST_WALLET = '0x1234567890123456789012345678901234567890';

describe('[SMOKE] /api/chat/intent endpoints', () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await serverAvailable();
    if (!serverUp) {
      console.log('[SMOKE] Server not available - HTTP tests skipped');
    }
  });

  describe('POST /api/chat/intent', () => {
    it('returns error for missing message', async () => {
      if (!serverUp) return;

      const res = await fetch(`${API_BASE}/api/chat/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: TEST_WALLET }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    it('returns error for missing wallet address', async () => {
      if (!serverUp) return;

      const res = await fetch(`${API_BASE}/api/chat/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'protect my savings' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    it('parses "protect my savings" as HEDGE intent', async () => {
      if (!serverUp) return;

      const res = await fetch(`${API_BASE}/api/chat/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'protect my savings',
          walletAddress: TEST_WALLET,
        }),
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.intent).toHaveProperty('type');
      expect(data.intent.type).toBe('HEDGE');
      expect(data.intent.action).toBe('move_to_stablecoin');
      expect(data.intent.confidence).toBeGreaterThan(0.8);
    });

    it('parses "grow my money" as YIELD intent', async () => {
      if (!serverUp) return;

      const res = await fetch(`${API_BASE}/api/chat/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'grow my money',
          walletAddress: TEST_WALLET,
        }),
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.intent.type).toBe('YIELD');
      expect(data.intent.action).toBe('supply_to_aave');
    });

    it('parses "what is my balance" as QUERY intent', async () => {
      if (!serverUp) return;

      const res = await fetch(`${API_BASE}/api/chat/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'what is my balance',
          walletAddress: TEST_WALLET,
        }),
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.intent.type).toBe('QUERY');
      expect(data.intent.action).toBe('get_balance');
    });

    it('returns clarification for unknown input', async () => {
      if (!serverUp) return;

      const res = await fetch(`${API_BASE}/api/chat/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'foobar xyz 123 random stuff',
          walletAddress: TEST_WALLET,
        }),
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.type).toBe('clarification');
      expect(data).toHaveProperty('suggestions');
    });

    it('returns intent_ready for high confidence actions', async () => {
      if (!serverUp) return;

      const res = await fetch(`${API_BASE}/api/chat/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'protect my savings',
          walletAddress: TEST_WALLET,
        }),
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(['intent_ready', 'confirmation', 'executed']).toContain(data.type);
    });
  });
});

describe('[SMOKE] /api/chat/intent/execute endpoint', () => {
  let serverUp = false;

  beforeAll(async () => {
    serverUp = await serverAvailable();
  });

  it('returns error for missing intent', async () => {
    if (!serverUp) return;

    const res = await fetch(`${API_BASE}/api/chat/intent/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: TEST_WALLET }),
    });

    expect(res.status).toBe(400);
  });

  it('returns error for missing wallet address', async () => {
    if (!serverUp) return;

    const res = await fetch(`${API_BASE}/api/chat/intent/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: { type: 'QUERY', action: 'get_balance', params: {} },
      }),
    });

    expect(res.status).toBe(400);
  });
});
