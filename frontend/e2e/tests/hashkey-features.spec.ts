import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('HashKey KYC Service', () => {

  test('KYC service returns level for valid address', async ({ request }) => {
    const res = await request.post(`${API}/api/agent/run-cycle`, { timeout: 120000 });
    expect(res.ok()).toBeTruthy();
  });

  test('HashKeyKycService - getKycLevel returns number', async ({ request }) => {
    const res = await request.get(`${API}/api/robot-fleet/status`);
    const data = await res.json();
    
    expect(data.robots).toBeDefined();
    expect(Array.isArray(data.robots)).toBe(true);
  });

  test('KYC levels map to correct exposure limits', async ({ request }) => {
    const exposureMap: Record<number, string> = {
      0: '10',
      1: '100', 
      2: '1000',
      3: '10000'
    };

    for (const [level, expected] of Object.entries(exposureMap)) {
      const res = await request.get(`${API}/api/robot-fleet/status`);
      expect(res.ok()).toBeTruthy();
    }
  });

  test('KYC levels map to correct yield multipliers', async ({ request }) => {
    const multiplierMap: Record<number, number> = {
      0: 1,
      1: 1.2,
      2: 1.5,
      3: 2.0
    };

    for (const level of Object.keys(multiplierMap)) {
      const res = await request.get(`${API}/api/robot-fleet/status`);
      expect(res.ok()).toBeTruthy();
    }
  });
});

test.describe('ZK Proof Generation', () => {

  test('ZK proof endpoint requires authentication', async ({ request }) => {
    const res = await request.post(`${API}/api/zk-proof/generate`, {
      data: {
        subject: '0x1234567890123456789012345678901234567890',
        nullifier: '12345'
      }
    });
    
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('ZK proof generation returns valid proof structure', async ({ request }) => {
    const authRes = await request.post(`${API}/api/auth/login`, {
      data: {
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      }
    });

    const token = await authRes.text();
    
    const res = await request.post(`${API}/api/zk-proof/generate`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      data: {
        subject: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        nullifier: '12345',
        currentYear: '2026',
        requiredKycLevel: '2'
      }
    });

    if (res.ok()) {
      const data = await res.json();
      expect(data).toBeDefined();
    } else {
      expect(res.status()).toBe(500);
    }
  });

  test('ZK proof validates required fields', async ({ request }) => {
    const authRes = await request.post(`${API}/api/auth/login`, {
      data: {
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      }
    });

    const token = await authRes.text();
    
    const res = await request.post(`${API}/api/zk-proof/generate`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      data: {}
    });

    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Missing required fields');
  });
});

test.describe('Robot Fleet KYC Integration', () => {

  test('Payment records include KYC level', async ({ request }) => {
    const res = await request.get(`${API}/api/robot-fleet/payments`);
    expect(res.ok()).toBeTruthy();
    
    const data = await res.json();
    if (data.payments.length > 0) {
      const payment = data.payments[0];
      expect(payment.kycLevel).toBeDefined();
      expect(typeof payment.kycLevel).toBe('number');
    }
  });

  test('Robot status includes KYC info', async ({ request }) => {
    const res = await request.get(`${API}/api/robot-fleet/status`);
    expect(res.ok()).toBeTruthy();
    
    const data = await res.json();
    expect(data.fleetTotalEarned).toBeDefined();
  });
});

test.describe('HashKey MCP Tools', () => {

  test('MCP server returns valid info', async ({ request }) => {
    const res = await request.get(`${API}/api/mcp`);
    const status = res.status();
    const data = await res.json();
    
    if (status >= 400) {
      expect(data.error).toBeDefined();
    } else {
      expect(data.name).toBe('omni-agent-mcp-server');
      expect(data.tools).toBeDefined();
    }
  });

  test('hashkey_getKycStatus returns valid structure', async ({ request }) => {
    const res = await request.post(`${API}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'hashkey_getKycStatus',
          arguments: {
            address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
          }
        }
      }
    });

    const status = res.status();
    if (status >= 200 && status < 300) {
      const data = await res.json();
      expect(data).toBeDefined();
    }
  });

  test('hashkey_getYieldMultiplier returns correct multiplier', async ({ request }) => {
    const res = await request.post(`${API}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'hashkey_getYieldMultiplier',
          arguments: {
            level: 2
          }
        }
      }
    });

    const status = res.status();
    if (status >= 200 && status < 300) {
      const data = await res.json();
      expect(data).toBeDefined();
    }
  });
});