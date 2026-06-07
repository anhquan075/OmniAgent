import { APIRequestContext, expect, test } from '@playwright/test';

const API = 'http://localhost:8000';
const FRONTEND_ORIGIN = 'http://localhost:5173';

test.describe('BNB MCP API', () => {
  test('lists the active BSC trading tools', async ({ request }) => {
    const res = await postMcp(request, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    const toolNames = body.result.tools.map((tool: { name: string }) => tool.name);

    expect(toolNames).toContain('bnb_agent_cockpit_snapshot');
    expect(toolNames).toContain('bnb_get_wallet');
    expect(toolNames).toContain('bnb_trade_ledger_summary');
    expect(toolNames).toContain('bnb_live_proof_bundle');
    expect(toolNames).toContain('bnb_competition_register');
    expect(toolNames).toContain('cmc_get_price_snapshot');
    expect(toolNames).toContain('cmc_daily_market_overview');
    expect(toolNames).toContain('bnb_run_autonomous_cycle');
    expect(toolNames).toContain('bnb_paid_resource_status');
    expect(toolNames.every((name: string) => name.startsWith('bnb_') || name.startsWith('cmc_'))).toBe(true);
  });

  test('returns BSC ledger evidence through JSON-RPC', async ({ request }) => {
    const res = await postMcp(request, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'bnb_trade_ledger_summary', arguments: { limit: 5 } },
    });
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    const payload = JSON.parse(body.result.content[0].text);
    expect(payload).toMatchObject({
      network: 'bsc',
      dailyCompliance: { tradeCount: expect.any(Number) },
      control: { emergencyPaused: expect.any(Boolean) },
    });
  });

  test('returns the live proof bundle through JSON-RPC', async ({ request }) => {
    const res = await postMcp(request, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'bnb_live_proof_bundle', arguments: { limit: 5 } },
    });
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    const payload = JSON.parse(body.result.content[0].text);
    expect(payload).toMatchObject({
      network: 'bsc',
      readyForLiveTrade: expect.any(Boolean),
      dailyCompliance: { tradeCount: expect.any(Number) },
      nextActions: expect.any(Array),
    });
  });
});

async function postMcp(request: APIRequestContext, data: Record<string, unknown>) {
  const session = await request.get(`${API}/api/session`, {
    headers: { Origin: FRONTEND_ORIGIN },
  });
  expect(session.ok()).toBeTruthy();
  const { csrfToken } = await session.json();
  let response = await request.post(`${API}/api/mcp`, {
    data,
    headers: { Origin: FRONTEND_ORIGIN, 'X-CSRF-Token': String(csrfToken) },
  });
  for (let attempt = 0; response.status() === 429 && attempt < 2; attempt += 1) {
    const body = await response.json().catch(() => ({ retryAfter: 1 }));
    await new Promise(resolve => setTimeout(resolve, (Number(body.retryAfter ?? 1) + 1) * 1000));
    response = await request.post(`${API}/api/mcp`, {
      data,
      headers: { Origin: FRONTEND_ORIGIN, 'X-CSRF-Token': String(csrfToken) },
    });
  }
  return response;
}
