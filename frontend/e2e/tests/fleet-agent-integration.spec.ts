import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('Fleet-Agent Integration', () => {
  
  test('Agent run-cycle endpoint returns success', async ({ request }) => {
    const res = await request.post(`${API}/api/agent/run-cycle`, { timeout: 120000 });
    expect(res.ok()).toBeTruthy();
    
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.summary).toBeDefined();
    expect(data.nextRunDelay).toBeDefined();
    expect(data.schedulingReason).toBeDefined();
  });

  test('Agent cycle includes council consensus tracking', async ({ request }) => {
    const res = await request.post(`${API}/api/agent/run-cycle`, { timeout: 120000 });
    const data = await res.json();
    expect(data.summary).toBeDefined();
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
    
    // Robot fleet tools are agent-only, not in MCP
    expect(tools).not.toContain('robot_fleet_get_robots');
    expect(tools).not.toContain('robot_fleet_status');
    expect(tools).not.toContain('robot_fleet_start');
    
    // X402 tools are disabled by default (ENABLE_X402=false)
    expect(tools.filter((n: string) => n.startsWith('x402_')).length).toBe(0);
  });
});
