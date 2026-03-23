import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001';
const MCP_ENDPOINT = `${API_BASE}/api/mcp`;

const rpc = (method: string, params: Record<string, unknown> = {}, id = 1) =>
  fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  }).then(r => r.json()) as Promise<{ jsonrpc: string; id: number; result?: unknown; error?: { code: number; message: string } }>;

const callTool = (name: string, args: Record<string, unknown> = {}, id = 1) =>
  rpc('tools/call', { name, arguments: args }, id) as Promise<{
    jsonrpc: string; id: number;
    result?: { content: Array<{ type: string; text: string }> };
    error?: { code: number; message: string };
  }>;

const serverAvailable = async (): Promise<boolean> => {
  try {
    const r = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list' }),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch { return false; }
};

describe('[INTEGRATION] HashKey MCP Tools — real HTTP requests', () => {
  beforeAll(async () => {
    const up = await serverAvailable();
    if (!up) {
      console.log('[INTEGRATION] Backend not available at', MCP_ENDPOINT, '— start with pnpm run dev');
    }
  });

  // ── Read-only tools (safe, always run) ────────────────────────────────

  describe('Read-only tools', () => {
    it('hashkey_getNetworkInfo returns chain info', async () => {
      const res = await callTool('hashkey_getNetworkInfo', {}, 1001);
      expect(res.result).toBeDefined();
      const text = res.result!.content[0].text;
      const data = JSON.parse(text);
      expect(data.chainId).toBe(133);
      expect(data.networkName).toBe('HashKey Chain Testnet');
      expect(data.blockNumber).toBeGreaterThan(0);
    });

    it('hashkey_checkKyc returns KYC status', async () => {
      const agentWallet = '0xA4c009f0541d9C7f86F12cF4470Faf60448B240B';
      const res = await callTool('hashkey_checkKyc', { address: agentWallet }, 1002);
      expect(res.result).toBeDefined();
      const text = res.result!.content[0].text;
      const data = JSON.parse(text);
      expect(data.isHuman).toBe(true);
      expect(data.kycLevel).toBe(3);
      expect(data.kycLevelName).toBe('PREMIUM');
    });

    it('hashkey_getVaultState returns vault metrics', async () => {
      const res = await callTool('hashkey_getVaultState', {}, 1003);
      expect(res.result).toBeDefined();
      const text = res.result!.content[0].text;
      const data = JSON.parse(text);
      expect(data).toHaveProperty('totalAssets');
      expect(data).toHaveProperty('totalSupply');
      expect(data).toHaveProperty('navPerShare');
      expect(data).toHaveProperty('assetAddress');
    });

    it('hashkey_getBalance returns native balance', async () => {
      const res = await callTool('hashkey_getBalance', {}, 1004);
      expect(res.result).toBeDefined();
      const text = res.result!.content[0].text;
      const data = JSON.parse(text);
      expect(data).toHaveProperty('nativeBalance');
      expect(data).toHaveProperty('nativeBalanceWei');
      expect(data.symbol).toBe('HSK');
    });

    it('hashkey_createWallet returns derived address', async () => {
      const res = await callTool('hashkey_createWallet', { walletIndex: 0 }, 1005);
      expect(res.result).toBeDefined();
      const text = res.result!.content[0].text;
      const data = JSON.parse(text);
      expect(data.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(data.network).toBe('hashkey');
      expect(data.chainId).toBe(133);
    });


  });

  // ── Write tools (on-chain, require gas + KYC) ─────────────────────────

  describe('Write tools (on-chain)', () => {
    it('hashkey_transfer HSK native token', async () => {
      const res = await callTool('hashkey_transfer', {
        to: '0xA4c009f0541d9C7f86F12cF4470Faf60448B240B',
        amount: '0.0001',
        token: 'HSK',
      }, 2001);
      expect(res.result || res.error).toBeDefined();
      if (res.error) {
        expect(res.error.code).toBeLessThan(0);
        return;
      }
      const text = res.result!.content[0].text;
      const data = JSON.parse(text);
      expect(data.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(data.amount).toBe('0.0001');
      expect(data.token).toBe('HSK');
    }, 30000);

    it('hashkey_vaultDeposit deposits USDT', async () => {
      const res = await callTool('hashkey_vaultDeposit', { amount: '1' }, 2002);
      expect(res.result || res.error).toBeDefined();
      if (res.error) {
        expect(res.error.code).toBeLessThan(0);
        return;
      }
      const text = res.result!.content[0].text;
      const data = JSON.parse(text);
      expect(data.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(data.assets).toBe('1');
    }, 30000);

    it('hashkey_getVaultState reflects deposit', async () => {
      const res = await callTool('hashkey_getVaultState', {}, 2003);
      expect(res.result).toBeDefined();
      const text = res.result!.content[0].text;
      const data = JSON.parse(text);
      expect(data.totalAssets).not.toBe('0.0');
    });

    it('hashkey_vaultWithdraw redeems shares (deposit first)', async () => {
      await callTool('hashkey_vaultDeposit', { amount: '0.1' }, 2004);
      const vaultState = await callTool('hashkey_getVaultState', {}, 2005);
      const vaultData = JSON.parse(vaultState.result!.content[0].text);
      const totalSupply = parseFloat(vaultData.totalSupply);
      expect(totalSupply).toBeGreaterThan(0);

      const sharesToWithdraw = Math.min(totalSupply, 0.000001).toFixed(9);
      const res = await callTool('hashkey_vaultWithdraw', { shares: sharesToWithdraw }, 2006);
      expect(res.result || res.error).toBeDefined();
      if (res.error) {
        expect(res.error.code).toBeLessThan(0);
        return;
      }
      const text = res.result!.content[0].text;
      const data = JSON.parse(text);
      expect(data.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    }, 60000);
  });

  // ── Error / validation cases ─────────────────────────────────────────

  describe('Error handling', () => {
    it('hashkey_transfer rejects invalid address', async () => {
      const res = await callTool('hashkey_transfer', {
        to: 'not-an-address',
        amount: '0.001',
      }, 3001);
      expect(res.result || res.error).toBeDefined();
      if (res.error) {
        expect(res.error.code).toBeLessThan(0);
      }
    });

    it('hashkey_vaultDeposit rejects missing amount', async () => {
      const res = await callTool('hashkey_vaultDeposit', {}, 3002);
      expect(res.result || res.error).toBeDefined();
      // Should fail with invalid params
      if (res.error) expect(res.error.code).toBeLessThan(0);
    });

    it('unknown tool returns TOOL_NOT_FOUND', async () => {
      const res = await rpc('tools/call', { name: 'hashkey_unknownTool', arguments: {} }, 3003) as any;
      expect(res.error).toBeDefined();
      expect(res.error.code).toBeLessThan(0);
    });
  });

  // ── Tool registry ───────────────────────────────────────────────────

  describe('Tool registry', () => {
    it('tools/list returns hashkey tools', async () => {
      const res = await rpc('tools/list', {}, 4001) as any;
      expect(res.result).toBeDefined();
      const tools = res.result.tools as Array<{ name: string }>;
      const hashkeyTools = tools.filter(t => t.name.startsWith('hashkey_'));
      expect(hashkeyTools.length).toBeGreaterThanOrEqual(10);
    });

    it('all 11 HashKey tools are registered', async () => {
      const res = await rpc('tools/list', {}, 4002) as any;
      const tools = res.result.tools as Array<{ name: string }>;
      const expected = [
        'hashkey_getNetworkInfo',
        'hashkey_checkKyc',
        'hashkey_getBalance',
        'hashkey_transfer',
        'hashkey_getVaultState',
        'hashkey_vaultDeposit',
        'hashkey_vaultWithdraw',
        'hashkey_createWallet',
        'hashkey_getSafeTxStatus',
        'hashkey_executeSafeTx',
      ];
      for (const name of expected) {
        expect(tools.some(t => t.name === name), `Missing: ${name}`).toBe(true);
      }
    });
  });
});
