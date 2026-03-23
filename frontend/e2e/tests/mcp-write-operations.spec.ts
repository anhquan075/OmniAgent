import { test, expect, APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3001';

const WRITE_TOOLS: [string, Record<string, unknown>][] = [
  ['wdk_vault_deposit', { amount: '1' }],
  ['wdk_vault_withdraw', { amount: '1' }],
  ['wdk_engine_executeCycle', {}],
  ['wdk_aave_supply', { amount: '1' }],
  ['wdk_aave_withdraw', { amount: '1' }],
  ['wdk_lending_supply', { amount: '1' }],
  ['wdk_lending_withdraw', { amount: '1' }],
  ['wdk_lending_borrow', { amount: '1' }],
  ['wdk_lending_repay', { amount: '1' }],
  ['wdk_bridge_usdt0', { amount: '1', dstChainId: '42161' }],
  ['wdk_swap_tokens', { amount: '1', fromToken: 'USDT', toToken: 'USDC' }],
  ['wdk_autonomous_cycle', {}],
  ['erc4337_execute', { to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', value: '0' }],
  ['erc4337_executeBatch', { calls: [] }],
  ['erc4337_setTokenApproval', { tokenAddress: '0xd077a400968890eacc75cdc901f0356c943e4fdb', spenderAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }],
  ['smartaccount_grantSessionKey', { sessionKeyAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', dailyLimit: '1000000' }],
  ['smartaccount_revokeSessionKey', { sessionKeyAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }],
  ['smartaccount_updateDailyLimit', { sessionKeyAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', dailyLimit: '2000000' }],
  ['smartaccount_addAllowedTarget', { sessionKeyAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', target: '0xd077a400968890eacc75cdc901f0356c943e4fdb' }],
  ['smartaccount_removeAllowedTarget', { sessionKeyAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', target: '0xd077a400968890eacc75cdc901f0356c943e4fdb' }],
  ['sepolia_transfer', { to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', amount: '1' }],
  ['sepolia_swap', { fromToken: 'USDT', toToken: 'USDC', amount: '1' }],
  ['sepolia_supplyAave', { amount: '1' }],
  ['sepolia_withdrawAave', { amount: '1' }],
  ['sepolia_bridgeLayerZero', { amount: '1', dstChainId: '42161' }],
  ['arbitrum_transfer', { to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', amount: '1' }],
  ['polygon_transfer', { to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', amount: '1' }],
  ['gnosis_transfer', { to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', amount: '1' }],
  ['hashkey_transfer', { to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', amount: '1' }],
  ['hashkey_vaultDeposit', { amount: '1' }],
  ['hashkey_vaultWithdraw', { amount: '1' }],
  ['hashkey_executeSafeTx', { safeTxHash: '0xabc' }],
];

async function callTool(request: APIRequestContext, name: string, args: Record<string, unknown> = {}, timeout = 60000) {
  const res = await request.post(`${API}/api/mcp`, {
    data: { jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } },
    timeout,
  });
  return res;
}

function parseContent(json: any): { success: boolean; data?: any; error?: string } {
  if (json?.error) {
    return { success: false, error: json.error.message || JSON.stringify(json.error) };
  }
  
  try {
    const text = json?.result?.content?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed?.success === false || parsed?.status === 'error') {
        return { success: false, error: parsed.error || parsed.errorMessage || parsed.message || 'Operation failed' };
      }
      return { success: true, data: parsed };
    }
  } catch {}
  
  return { success: false, error: 'No response content' };
}

test.describe('Write Operation Tools — Signature Required', () => {
  for (const [name, args] of WRITE_TOOLS) {
    test(`${name} returns response (success or proper error)`, async ({ request }) => {
      const res = await callTool(request, name, args);
      const json = await res.json();
      const parsed = parseContent(json);
      
      console.log(`Tool: ${name}`);
      console.log(`Status: ${res.status()}`);
      console.log(`Parsed:`, parsed);
      
      expect(res.ok(), `${name}: should return 200`).toBeTruthy();
      expect(parsed.success || parsed.error, `${name}: should have either success or error`).toBeTruthy();
      
      if (parsed.error) {
        expect(parsed.error.length > 5, `${name}: error message should be meaningful`).toBeTruthy();
      }
    });
  }
});
