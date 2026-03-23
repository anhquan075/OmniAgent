import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCP_ERRORS } from '@/mcp-server/types/mcp-protocol';

vi.mock('child_process', () => ({
  spawn: vi.fn((_cmd: string, args: string[]) => {
    const taskName = args[1];
    let stdoutContent = '';
    if (taskName === 'transfer') {
      stdoutContent = 'txHash: 0x' + 'a'.repeat(64) + '\n';
    } else if (taskName === 'vault-deposit') {
      stdoutContent = 'txHash: 0x' + 'b'.repeat(64) + '\n';
    } else if (taskName === 'vault-withdraw') {
      stdoutContent = 'txHash: 0x' + 'c'.repeat(64) + '\n';
    }
    let dataHandler: ((d: any) => void) | null = null;
    const stdoutEmitter = {
      on: vi.fn((evt: string, cb: (data: any) => void) => {
        if (evt === 'data') dataHandler = cb;
        return stdoutEmitter;
      }),
    };
    const proc = {
      stdout: stdoutEmitter,
      stderr: { on: vi.fn(() => proc) },
      on: vi.fn((evt: string, cb: (code: number) => void) => {
        if (evt === 'close') setTimeout(() => cb(0), 0);
        return proc;
      }),
    };
    setTimeout(() => { if (dataHandler) dataHandler(Buffer.from(stdoutContent)); }, 0);
    return proc;
  }),
}));

vi.mock('@/config/env', () => ({
  env: {
    HASHKEY_CHAIN_ID: 133,
    HASHKEY_RPC_URL: 'https://testnet.hsk.xyz',
    HASHKEY_VAULT_ADDRESS: '0x605b6b8C83d8b0EA8867BEda4099DE4F042F7318',
    HASHKEY_USDT_ADDRESS: '0xA3eb6Cb28659ec53388FE5Ff3E64920e3C274038',
    HASHKEY_KYC_SBT_ADDRESS: '0x1525E262Cb5bDFC7b51802c36a1141bA94405F76',
    HASHKEY_SUPRA_PROXY_ADDRESS: '0x443A0f4Da5d2fdC47de3eeD45Af41d399F0E5702',
    HASHKEY_SAFE_ADDRESS: '0x742d35cc6634c0532925a3b844bc9e7595f0beb0',
    PRIVATE_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    WDK_SECRET_SEED: 'test seed word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12',
  },
}));

vi.mock('@/lib/wdk-loader', () => ({
  getWdkForHashKey: vi.fn(() => ({
    getAccount: vi.fn(() => ({
      getAddress: vi.fn(() => Promise.resolve('0xA4c009f0541d9C7f86F12cF4470Faf60448B240B')),
    })),
  })),
  getHashKeySigner: vi.fn(() => ({
    getAddress: vi.fn(() => Promise.resolve('0xA4c009f0541d9C7f86F12cF4470Faf60448B240B')),
    sendTransaction: vi.fn(() => Promise.resolve({ hash: '0x' + 'b'.repeat(64) })),
  })),
}));

vi.mock('@/services/safe-multisig', () => ({
  getPendingTxs: vi.fn(() => Promise.resolve([])),
  executeSafeTx: vi.fn(() => Promise.resolve({ hash: '0x' + 'c'.repeat(64) })),
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/contracts/clients/ethers', () => ({
  hashkeyProvider: {
    getNetwork: vi.fn(() => ({ chainId: 133 })),
    getBlockNumber: vi.fn(() => Promise.resolve(25581000)),
    getFeeData: vi.fn(() => Promise.resolve({ gasPrice: 1_000_000_000n })),
    getBalance: vi.fn(() => Promise.resolve(1_000_000_000_000_000_000n)),
    getTransactionCount: vi.fn(() => Promise.resolve(1)),
    getTransactionReceipt: vi.fn(() => Promise.resolve(null)),
    lookupAddress: vi.fn(() => Promise.resolve(null)),
  },
}));

vi.mock('@/mcp-server/handlers/hashkey-tools', async (getOriginal) => {
  const { ethers } = await import('ethers');
  const mod = await getOriginal() as any;

  return {
    ...mod,
    handleHashKeyTool: mod.handleHashKeyTool,
  };
});

const createContext = (overrides: Record<string, unknown> = {}) => ({
  requestId: 'test-' + Math.random(),
  timestamp: Date.now(),
  policyGuardEnabled: false,
  ...overrides,
}) as any;

describe('[UNIT] HashKey MCP Tools', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('loads the real handler', async () => {
    const mod = await import('@/mcp-server/handlers/hashkey-tools');
    expect(mod.handleHashKeyTool).toBeDefined();
  });

  describe('hashkey_getNetworkInfo', () => {
    it('returns chain info', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const res = await handleHashKeyTool('hashkey_getNetworkInfo', {}, createContext());
      expect(res.success).toBe(true);
      expect(res.data.chainId).toBe(133);
    });

    it('returns block number', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const res = await handleHashKeyTool('hashkey_getNetworkInfo', {}, createContext());
      expect(res.success).toBe(true);
      expect(res.data.blockNumber).toBeGreaterThan(0);
    });
  });

  describe('hashkey_getBalance', () => {
    it('returns native balance', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const res = await handleHashKeyTool('hashkey_getBalance', {}, createContext());
      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('nativeBalance');
      expect(res.data.symbol).toBe('HSK');
    });

    it('accepts custom address', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const res = await handleHashKeyTool(
        'hashkey_getBalance',
        { address: '0xA4c009f0541d9C7f86F12cF4470Faf60448B240B' },
        createContext()
      );
      expect(res.success).toBe(true);
    });
  });

  describe('hashkey_checkKyc', () => {
    it('returns INVALID_PARAMS when KYC address not configured', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const { env } = await import('@/config/env');
      const original = env.HASHKEY_KYC_SBT_ADDRESS;
      env.HASHKEY_KYC_SBT_ADDRESS = '';
      const res = await handleHashKeyTool(
        'hashkey_checkKyc',
        { address: '0xA4c009f0541d9C7f86F12cF4470Faf60448B240B' },
        createContext()
      );
      expect(res.success).toBe(false);
      expect(res.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
      env.HASHKEY_KYC_SBT_ADDRESS = original;
    });
  });

  describe('hashkey_getVaultState', () => {
    it('returns INVALID_PARAMS when vault address missing', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const { env } = await import('@/config/env');
      const original = env.HASHKEY_VAULT_ADDRESS;
      env.HASHKEY_VAULT_ADDRESS = '';
      const res = await handleHashKeyTool('hashkey_getVaultState', {}, createContext());
      expect(res.success).toBe(false);
      expect(res.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
      env.HASHKEY_VAULT_ADDRESS = original;
    });
  });

  describe('hashkey_createWallet', () => {
    it('returns wallet address', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const res = await handleHashKeyTool('hashkey_createWallet', {}, createContext());
      expect(res.success).toBe(true);
      expect(res.data.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(res.data.network).toBe('hashkey');
      expect(res.data.chainId).toBe(133);
    });

    it('accepts walletIndex param', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const res = await handleHashKeyTool('hashkey_createWallet', { walletIndex: 5 }, createContext());
      expect(res.success).toBe(true);
    });
  });

  describe('hashkey_transfer', () => {
    it('returns INVALID_PARAMS for invalid address', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const res = await handleHashKeyTool(
        'hashkey_transfer',
        { to: 'not-an-address', amount: '0.001' },
        createContext()
      );
      expect(res.success).toBe(false);
      expect(res.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
    });

    it('calls spawn for valid transfer', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const { spawn } = await import('child_process');
      const res = await handleHashKeyTool(
        'hashkey_transfer',
        { to: '0xA4c009f0541d9C7f86F12cF4470Faf60448B240B', amount: '0.001', token: 'HSK' },
        createContext()
      );
      expect(res.success).toBe(true);
      expect(spawn).toHaveBeenCalledWith('npx', expect.arrayContaining(['hardhat', 'transfer']), expect.any(Object));
    });
  });

  describe('hashkey_vaultDeposit', () => {
    it('returns INVALID_PARAMS when vault address missing', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const { env } = await import('@/config/env');
      const original = env.HASHKEY_VAULT_ADDRESS;
      env.HASHKEY_VAULT_ADDRESS = '';
      const res = await handleHashKeyTool('hashkey_vaultDeposit', { amount: '1' }, createContext());
      expect(res.success).toBe(false);
      expect(res.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
      env.HASHKEY_VAULT_ADDRESS = original;
    });

    it('calls spawn with correct args', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const { spawn } = await import('child_process');
      const res = await handleHashKeyTool('hashkey_vaultDeposit', { amount: '10' }, createContext());
      expect(res.success).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['hardhat', 'vault-deposit', '--amount', '10']),
        expect.any(Object)
      );
    });
  });

  describe('hashkey_vaultWithdraw', () => {
    it('returns INVALID_PARAMS when vault address missing', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const { env } = await import('@/config/env');
      const original = env.HASHKEY_VAULT_ADDRESS;
      env.HASHKEY_VAULT_ADDRESS = '';
      const res = await handleHashKeyTool('hashkey_vaultWithdraw', { shares: '1' }, createContext());
      expect(res.success).toBe(false);
      expect(res.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
      env.HASHKEY_VAULT_ADDRESS = original;
    });

    it('calls spawn with correct args', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const { spawn } = await import('child_process');
      const res = await handleHashKeyTool('hashkey_vaultWithdraw', { shares: '0.5' }, createContext());
      expect(res.success).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['hardhat', 'vault-withdraw', '--shares', '0.5']),
        expect.any(Object)
      );
    });
  });

  describe('hashkey_getSafeTxStatus', () => {
    it('returns pending transactions', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const res = await handleHashKeyTool('hashkey_getSafeTxStatus', {}, createContext());
      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('count');
      expect(Array.isArray(res.data.pendingTx)).toBe(true);
    });

    it('uses custom safe address', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const res = await handleHashKeyTool(
        'hashkey_getSafeTxStatus',
        { safeAddress: '0x742d35cc6634c0532925a3b844bc9e7595f0beb0' },
        createContext()
      );
      expect(res.success).toBe(true);
    });
  });

  describe('hashkey_executeSafeTx', () => {
    it('returns INVALID_PARAMS when safe address missing and not configured', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const { env } = await import('@/config/env');
      const original = env.HASHKEY_SAFE_ADDRESS;
      env.HASHKEY_SAFE_ADDRESS = '';
      const res = await handleHashKeyTool('hashkey_executeSafeTx', { to: '0xA4c009f0541d9C7f86F12cF4470Faf60448B240B', data: '0x' }, createContext());
      expect(res.success).toBe(false);
      expect(res.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
      env.HASHKEY_SAFE_ADDRESS = original;
    });

    it('executes tx when safe address is configured', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const res = await handleHashKeyTool(
        'hashkey_executeSafeTx',
        { to: '0xA4c009f0541d9C7f86F12cF4470Faf60448B240B', data: '0x' },
        createContext()
      );
      expect(res.success).toBe(true);
      expect(res.data).toHaveProperty('txHash');
    });
  });

  describe('Error handling', () => {
    it('returns TOOL_NOT_FOUND for unknown tool', async () => {
      const { handleHashKeyTool } = await import('@/mcp-server/handlers/hashkey-tools');
      const res = await handleHashKeyTool('hashkey_unknown_tool', {}, createContext());
      expect(res.success).toBe(false);
      expect(res.error.code).toBe(MCP_ERRORS.TOOL_NOT_FOUND);
    });
  });
});
