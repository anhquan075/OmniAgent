import { test, expect, APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3001';

const READONLY_TOOLS: [string, Record<string, unknown>][] = [
  ['x402_list_services', {}],
  ['x402_fleet_status', {}],
  ['x402_get_balance', {}],
  ['wdk_vault_getBalance', {}],
  ['wdk_vault_getState', {}],
  ['wdk_engine_getRiskMetrics', {}],
  ['wdk_engine_getCycleState', {}],
  ['wdk_aave_getPosition', {}],
  ['wdk_lending_getPosition', {}],
  ['wdk_autonomous_status', {}],
  ['erc4337_createAccount', {}],
  ['erc4337_getAccountAddress', {}],
  ['erc4337_isValidAccount', { accountAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }],
  ['erc4337_getBalance', { accountAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }],
  ['erc4337_getDeposit', { accountAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }],
  ['smartaccount_getAddress', {}],
  ['smartaccount_listSessionKeys', {}],
  ['smartaccount_getSessionKeyStatus', { sessionKeyAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }],
  ['smartaccount_create', {}],
  ['sepolia_createWallet', {}],
  ['sepolia_getBalance', {}],
  ['sepolia_getNavInfo', {}],
  ['sepolia_getCreditScore', {}],
  ['arbitrum_createWallet', {}],
  ['arbitrum_getBalance', {}],
  ['arbitrum_getGasPrice', {}],
  ['polygon_createWallet', {}],
  ['polygon_getBalance', {}],
  ['polygon_getGasPrice', {}],
  ['gnosis_createWallet', {}],
  ['gnosis_getBalance', {}],
  ['gnosis_getGasPrice', {}],
  ['hashkey_createWallet', {}],
  ['hashkey_getBalance', { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }],
  ['hashkey_checkKyc', { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }],
  ['hashkey_getNetworkInfo', {}],
  ['hashkey_getVaultState', {}],
  ['hashkey_getSafeTxStatus', { safeAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }],
  ['market_get_price_matrix', { pairs: ['BTC/USD'] }],
  ['market_get_best_opportunity', {}],
  ['oracle_get_status', {}],
  ['oracle_get_instant_price', { pair: 'ETH/USD' }],
  ['oracle_get_twap_price', { pair: 'ETH/USD' }],
  ['get_agent_reputation', { agentTokenId: 0 }],
  ['get_staking_rewards', { agentTokenId: 0 }],
];

async function callTool(request: APIRequestContext, name: string, args: Record<string, unknown> = {}, timeout = 30000) {
  const res = await request.post(`${API}/api/mcp`, {
    data: { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } },
    timeout,
  });
  return res;
}

function parseContent(json: any): any {
  try {
    const text = json?.result?.content?.[0]?.text;
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function assertValidToolResponse(name: string, json: any, minProps = 1) {
  expect(json, `${name}: result should exist`).not.toBeNull();
  const keys = Object.keys(json);
  expect(keys.length, `${name}: should have at least ${minProps} key(s), got: ${keys.join(',')}`).toBeGreaterThanOrEqual(minProps);
}

test.describe('All Read-Only MCP Tools — Comprehensive Tests', () => {
  test('tools/list returns complete tool list', async ({ request }) => {
    const res = await request.post(`${API}/api/mcp`, {
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const tools = json.result?.tools || [];
    const names = tools.map((t: any) => t.name);
    console.log(`Total tools registered: ${names.length}`);
    expect(names.length).toBeGreaterThanOrEqual(80);
  });

  for (const [name, args] of READONLY_TOOLS) {
    test(`${name} returns valid response`, async ({ request }) => {
      const res = await callTool(request, name, args);
      expect(res.ok(), `${name}: should return 200`).toBeTruthy();
      const json = await res.json();
      const content = parseContent(json);
      assertValidToolResponse(name, content);
    });
  }
});
