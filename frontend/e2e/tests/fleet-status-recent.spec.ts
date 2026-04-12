import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('Fleet Status & Payments API', () => {
  
  test('Robot fleet status endpoint returns valid structure', async ({ request }) => {
    const res = await request.get(`${API}/api/robot-fleet/status`);
    expect(res.ok()).toBeTruthy();
    
    const data = await res.json();
    expect(data.robots).toBeDefined();
    expect(Array.isArray(data.robots)).toBe(true);
    expect(data.fleetTotalEarned).toBeDefined();
  });

  test('Robot fleet payments endpoint returns valid structure', async ({ request }) => {
    const res = await request.get(`${API}/api/robot-fleet/payments`);
    expect(res.ok()).toBeTruthy();
    
    const data = await res.json();
    expect(data.payments).toBeDefined();
    expect(Array.isArray(data.payments)).toBe(true);
    expect(data.total).toBeDefined();
  });

  test('Robot fleet payments respects limit query param', async ({ request }) => {
    const res = await request.get(`${API}/api/robot-fleet/payments?limit=5`);
    expect(res.ok()).toBeTruthy();
    
    const data = await res.json();
    expect(data.payments.length).toBeLessThanOrEqual(5);
  });
});

test.describe('Agent Run Cycle', () => {
  
  test('run-cycle returns success with summary', async ({ request }) => {
    const res = await request.post(`${API}/api/agent/run-cycle`, { timeout: 120000 });
    expect(res.ok()).toBeTruthy();
    
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.summary).toBeDefined();
  });

  test('run-cycle returns scheduling metadata', async ({ request }) => {
    const res = await request.post(`${API}/api/agent/run-cycle`, { timeout: 120000 });
    const data = await res.json();
    
    expect(data.nextRunDelay).toBeDefined();
    expect(typeof data.nextRunDelay).toBe('number');
    expect(data.schedulingReason).toBeDefined();
    expect(typeof data.schedulingReason).toBe('string');
  });
});

test.describe('MCP Tools', () => {
  
  test('Robot fleet tools NOT exposed via MCP', async ({ request }) => {
    const res = await request.post(`${API}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      }
    });
    
    const data = await res.json();
    const tools = data.result.tools.map((t: any) => t.name);
    
    expect(tools).not.toContain('robot_fleet_get_robots');
    expect(tools).not.toContain('robot_fleet_status');
    expect(tools).not.toContain('robot_fleet_start');
    expect(tools).not.toContain('robot_fleet_stop');
    expect(tools).not.toContain('robot_fleet_register');
  });

  test('X402 tools disabled by default', async ({ request }) => {
    const res = await request.post(`${API}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      }
    });
    
    const data = await res.json();
    const x402Tools = data.result.tools.filter((t: any) => t.name.startsWith('x402_'));
    expect(x402Tools.length).toBe(0);
  });
});
