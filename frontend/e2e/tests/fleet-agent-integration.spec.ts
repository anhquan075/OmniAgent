import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('Fleet-Agent Integration', () => {
  
  test('Agent run-cycle endpoint returns success', async ({ request }) => {
<<<<<<< HEAD
    const res = await request.post(`${API}/api/agent/run-cycle`, { timeout: 120000 });
=======
    const res = await request.post(`${API}/api/agent/run-cycle`);
>>>>>>> aa67da8 (test: add fleet-agent integration e2e tests)
    expect(res.ok()).toBeTruthy();
    
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.summary).toBeDefined();
    expect(data.nextRunDelay).toBeDefined();
    expect(data.schedulingReason).toBeDefined();
  });

  test('Agent cycle includes fleet earnings tracking', async ({ request }) => {
<<<<<<< HEAD
    const res = await request.post(`${API}/api/agent/run-cycle`, { timeout: 120000 });
=======
    const res = await request.post(`${API}/api/agent/run-cycle`);
>>>>>>> aa67da8 (test: add fleet-agent integration e2e tests)
    const data = await res.json();
    expect(data.summary).toBeDefined();
  });

  test('MCP tool x402_fleet_status is available', async ({ request }) => {
    const res = await request.post(`${API}/api/mcp`, {
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      }
    });
    
    const data = await res.json();
    const tools = data.result.tools.map((t: any) => t.name);
    expect(tools).toContain('x402_fleet_status');
  });

  test('Robot fleet tools are NOT in MCP (only in agentTools)', async ({ request }) => {
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
  });
});
