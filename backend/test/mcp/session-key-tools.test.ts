import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleSessionKeyTool, sessionKeyTools } from '@/mcp-server/handlers/session-key-tools';
import { McpExecutionContext, MCP_ERRORS } from '@/mcp-server/types/mcp-protocol';
import { ethers } from 'ethers';
import * as sessionKeyStore from '@/lib/session-key-store';

const mockManager = {
  getSmartAccountAddress: vi.fn(),
  isSmartAccountDeployed: vi.fn(),
  createSmartAccount: vi.fn(),
  grantSessionKey: vi.fn(),
  revokeSessionKey: vi.fn(),
  updateDailyLimit: vi.fn(),
  addAllowedTarget: vi.fn(),
  removeAllowedTarget: vi.fn(),
  isSessionKeyValid: vi.fn(),
  getSessionKeyInfo: vi.fn(),
  getActiveSessionKeys: vi.fn(),
  getSignerForUser: vi.fn(),
  generateSessionKeyPair: vi.fn(),
};

vi.mock('@/services/session-key-manager', () => ({
  getSessionKeyManager: () => mockManager,
}));

vi.mock('@/lib/session-key-store', () => ({
  getSessionKey: vi.fn(),
  getSessionKeyStatus: vi.fn(),
  storeSessionKey: vi.fn(),
  deleteSessionKey: vi.fn(),
  getAllSessionKeys: vi.fn(),
}));

vi.mock('@/lib/wdk-loader', () => ({
  getWdkSigner: vi.fn(async () => {
    const provider = new ethers.JsonRpcProvider('http://localhost:8545');
    return new ethers.Wallet(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      provider
    );
  }),
}));

vi.mock('@/config/env', () => ({
  env: {
    SEPOLIA_RPC_URL: 'http://localhost:8545',
    PRIVATE_KEY: undefined,
    WDK_VAULT_ADDRESS: '0x742d35cc6634c0532925a3b844bc9e7595f0beb0',
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('[INTEGRATION] Session Key MCP Tools', () => {
  const testOwner = '0x742d35cc6634c0532925a3b844bc9e7595f0beb0';
  const testSmartAccount = '0x1234567890123456789012345678901234567890';
  const testSessionKey = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

  const createContext = (overrides?: Partial<McpExecutionContext>): McpExecutionContext => ({
    requestId: 'test-request-123',
    timestamp: Date.now(),
    policyGuardEnabled: false,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tool Registration', () => {
    it('should have 9 session key tools registered', () => {
      expect(sessionKeyTools).toHaveLength(9);
    });

    it('should have correct tool names', () => {
      const toolNames = sessionKeyTools.map(t => t.name);
      expect(toolNames).toContain('smartaccount_create');
      expect(toolNames).toContain('smartaccount_getAddress');
      expect(toolNames).toContain('smartaccount_grantSessionKey');
      expect(toolNames).toContain('smartaccount_revokeSessionKey');
      expect(toolNames).toContain('smartaccount_updateDailyLimit');
      expect(toolNames).toContain('smartaccount_addAllowedTarget');
      expect(toolNames).toContain('smartaccount_removeAllowedTarget');
      expect(toolNames).toContain('smartaccount_getSessionKeyStatus');
      expect(toolNames).toContain('smartaccount_listSessionKeys');
    });

    it('should have correct blockchain assignment', () => {
      sessionKeyTools.forEach(tool => {
        expect(tool.blockchain).toBe('sepolia');
      });
    });

    it('should have correct category', () => {
      sessionKeyTools.forEach(tool => {
        expect(tool.category).toBe('account-abstraction');
      });
    });
  });

  describe('smartaccount_create', () => {
    it('should return existing account if already deployed', async () => {
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);
      mockManager.isSmartAccountDeployed.mockResolvedValue(true);

      const result = await handleSessionKeyTool(
        'smartaccount_create',
        { owner: testOwner },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.account).toBe(testSmartAccount);
      expect(result.data.alreadyExists).toBe(true);
      expect(result.data.isDeployed).toBe(true);
    });

    it('should create new account if none exists', async () => {
      mockManager.getSmartAccountAddress.mockResolvedValue('');
      mockManager.isSmartAccountDeployed.mockResolvedValue(false);
      mockManager.createSmartAccount.mockResolvedValue({ txHash: '0xabc' });
      mockManager.getSmartAccountAddress.mockResolvedValueOnce('').mockResolvedValueOnce(testSmartAccount);

      const result = await handleSessionKeyTool(
        'smartaccount_create',
        { owner: testOwner },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(mockManager.createSmartAccount).toHaveBeenCalled();
    });

    it('should resolve owner from context if not provided', async () => {
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);
      mockManager.isSmartAccountDeployed.mockResolvedValue(true);

      const result = await handleSessionKeyTool(
        'smartaccount_create',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.account).toBe(testSmartAccount);
    });
  });

  describe('smartaccount_getAddress', () => {
    it('should return smart account address for owner', async () => {
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);
      mockManager.isSmartAccountDeployed.mockResolvedValue(true);

      const result = await handleSessionKeyTool(
        'smartaccount_getAddress',
        { owner: testOwner },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.smartAccount).toBe(testSmartAccount);
      expect(result.data.isDeployed).toBe(true);
      expect(result.data.owner.toLowerCase()).toBe(testOwner.toLowerCase());
    });

    it('should return empty string for non-existent account', async () => {
      mockManager.getSmartAccountAddress.mockResolvedValue('');
      mockManager.isSmartAccountDeployed.mockResolvedValue(false);

      const result = await handleSessionKeyTool(
        'smartaccount_getAddress',
        { owner: testOwner },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.smartAccount).toBe('');
      expect(result.data.isDeployed).toBe(false);
    });

    it('should use userWallet from context if owner not provided', async () => {
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);
      mockManager.isSmartAccountDeployed.mockResolvedValue(true);

      const result = await handleSessionKeyTool(
        'smartaccount_getAddress',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.smartAccount).toBe(testSmartAccount);
    });
  });

  describe('smartaccount_grantSessionKey', () => {
    it('should grant session key with default values', async () => {
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);
      mockManager.grantSessionKey.mockResolvedValue({
        sessionKeyAddress: testSessionKey,
        txHash: '0xgrant',
        encryptedPrivateKey: 'encrypted-key-data',
      });

      const result = await handleSessionKeyTool(
        'smartaccount_grantSessionKey',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
      expect(result.data.sessionKey).toBe(testSessionKey);
      expect(result.data.dailyLimitUSD).toBe(10000);
      expect(result.data.txHash).toBe('0xgrant');
    });

    it('should grant session key with custom values', async () => {
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);
      mockManager.grantSessionKey.mockResolvedValue({
        sessionKeyAddress: testSessionKey,
        txHash: '0xgrant',
        encryptedPrivateKey: 'encrypted-key-data',
      });

      const result = await handleSessionKeyTool(
        'smartaccount_grantSessionKey',
        {
          dailyLimitUSD: 5000,
          durationDays: 7,
          allowedTargets: ['0x1111111111111111111111111111111111111111'],
        },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.dailyLimitUSD).toBe(5000);
      expect(result.data.expiresAt).toBeDefined();
    });

    it('should fail if no smart account exists', async () => {
      mockManager.getSmartAccountAddress.mockResolvedValue('');

      const result = await handleSessionKeyTool(
        'smartaccount_grantSessionKey',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
      expect(result.error.message).toContain('No smart account found');
    });

    it('should validate target addresses', async () => {
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);

      const result = await handleSessionKeyTool(
        'smartaccount_grantSessionKey',
        {
          allowedTargets: ['invalid-address'],
        },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
      expect(result.error.message).toContain('Invalid target address');
    });

    it('should use default vault address when allowedTargets is empty', async () => {
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);
      mockManager.grantSessionKey.mockResolvedValue({
        sessionKeyAddress: testSessionKey,
        txHash: '0xgrant',
        encryptedPrivateKey: 'encrypted-key-data',
      });

      const result = await handleSessionKeyTool(
        'smartaccount_grantSessionKey',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(mockManager.grantSessionKey).toHaveBeenCalledWith(
        testSmartAccount,
        10000,
        expect.arrayContaining([expect.stringMatching(/^0x/)]),
        30,
        expect.any(String)
      );
    });
  });

  describe('smartaccount_revokeSessionKey', () => {
    it('should revoke active session key', async () => {
      vi.mocked(sessionKeyStore.getSessionKey).mockResolvedValue({
        sessionKeyAddress: testSessionKey,
        smartAccount: testSmartAccount,
        encryptedPrivateKey: 'encrypted',
      });
      mockManager.revokeSessionKey.mockResolvedValue({ txHash: '0xrevoke' });

      const result = await handleSessionKeyTool(
        'smartaccount_revokeSessionKey',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
      expect(result.data.revokedKey).toBe(testSessionKey);
      expect(result.data.txHash).toBe('0xrevoke');
    });

    it('should fail if no active session key', async () => {
      vi.mocked(sessionKeyStore.getSessionKey).mockResolvedValue(null);

      const result = await handleSessionKeyTool(
        'smartaccount_revokeSessionKey',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
      expect(result.error.message).toContain('No active session key found');
    });
  });

  describe('smartaccount_updateDailyLimit', () => {
    it('should update daily limit', async () => {
      vi.mocked(sessionKeyStore.getSessionKey).mockResolvedValue({
        sessionKeyAddress: testSessionKey,
        smartAccount: testSmartAccount,
        encryptedPrivateKey: 'encrypted',
      });
      mockManager.updateDailyLimit.mockResolvedValue({ txHash: '0xupdate' });

      const result = await handleSessionKeyTool(
        'smartaccount_updateDailyLimit',
        { newLimitUSD: 5000 },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
      expect(result.data.newLimitUSD).toBe(5000);
      expect(result.data.txHash).toBe('0xupdate');
    });

    it('should fail if newLimitUSD is negative', async () => {
      const result = await handleSessionKeyTool(
        'smartaccount_updateDailyLimit',
        { newLimitUSD: -100 },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
      expect(result.error.message).toContain('positive number');
    });

    it('should fail if no active session key', async () => {
      vi.mocked(sessionKeyStore.getSessionKey).mockResolvedValue(null);

      const result = await handleSessionKeyTool(
        'smartaccount_updateDailyLimit',
        { newLimitUSD: 5000 },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
      expect(result.error.message).toContain('No active session key');
    });
  });

  describe('smartaccount_addAllowedTarget', () => {
    it('should add allowed target', async () => {
      const existingTarget = '0x1111111111111111111111111111111111111111';
      const newTarget = '0x2222222222222222222222222222222222222222';

      vi.mocked(sessionKeyStore.getSessionKey).mockResolvedValue({
        sessionKeyAddress: testSessionKey,
        smartAccount: testSmartAccount,
        allowedTargets: [existingTarget],
        encryptedPrivateKey: 'encrypted',
      });

      const result = await handleSessionKeyTool(
        'smartaccount_addAllowedTarget',
        { target: newTarget },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
      expect(result.data.target).toBe(newTarget.toLowerCase());
      expect(result.data.allTargets).toContain(newTarget.toLowerCase());
      expect(result.data.allTargets).toContain(existingTarget.toLowerCase());
    });

    it('should fail for invalid address', async () => {
      const result = await handleSessionKeyTool(
        'smartaccount_addAllowedTarget',
        { target: 'not-an-address' },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
      expect(result.error.message).toContain('valid target address');
    });

    it('should fail if no active session key', async () => {
      vi.mocked(sessionKeyStore.getSessionKey).mockResolvedValue(null);

      const result = await handleSessionKeyTool(
        'smartaccount_addAllowedTarget',
        { target: '0x2222222222222222222222222222222222222222' },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
      expect(result.error.message).toContain('No active session key');
    });
  });

  describe('smartaccount_removeAllowedTarget', () => {
    it('should remove allowed target', async () => {
      const existingTarget = '0x1111111111111111111111111111111111111111';

      vi.mocked(sessionKeyStore.getSessionKey).mockResolvedValue({
        sessionKeyAddress: testSessionKey,
        smartAccount: testSmartAccount,
        allowedTargets: [existingTarget],
        encryptedPrivateKey: 'encrypted',
      });

      const result = await handleSessionKeyTool(
        'smartaccount_removeAllowedTarget',
        { target: existingTarget },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
      expect(result.data.allTargets).not.toContain(existingTarget.toLowerCase());
    });

    it('should be case-insensitive when removing', async () => {
      const existingTarget = '0x1111111111111111111111111111111111111111';
      const lowerTarget = existingTarget.toLowerCase();

      vi.mocked(sessionKeyStore.getSessionKey).mockResolvedValue({
        sessionKeyAddress: testSessionKey,
        smartAccount: testSmartAccount,
        allowedTargets: [existingTarget],
        encryptedPrivateKey: 'encrypted',
      });

      const result = await handleSessionKeyTool(
        'smartaccount_removeAllowedTarget',
        { target: lowerTarget },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.allTargets).not.toContain(existingTarget.toLowerCase());
    });

    it('should fail if target not provided', async () => {
      const result = await handleSessionKeyTool(
        'smartaccount_removeAllowedTarget',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(MCP_ERRORS.INVALID_PARAMS);
      expect(result.error.message).toContain('target address is required');
    });
  });

  describe('smartaccount_getSessionKeyStatus', () => {
    it('should return active status when session key exists', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      vi.mocked(sessionKeyStore.getSessionKey).mockResolvedValue({
        sessionKeyAddress: testSessionKey,
        smartAccount: testSmartAccount,
        encryptedPrivateKey: 'encrypted',
      });
      vi.mocked(sessionKeyStore.getSessionKeyStatus).mockResolvedValue({
        dailyLimitUSD: 10000,
        dailySpentUSD: 2500,
        expiresAt: expiresAt.toISOString(),
        allowedTargets: ['0x1111111111111111111111111111111111111111'],
        resetAt: resetAt.toISOString(),
      });

      const result = await handleSessionKeyTool(
        'smartaccount_getSessionKeyStatus',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.active).toBe(true);
      expect(result.data.sessionKey).toBe(testSessionKey);
      expect(result.data.dailyLimitUSD).toBe(10000);
      expect(result.data.dailySpentUSD).toBe(2500);
      expect(result.data.remainingUSD).toBe(7500);
    });

    it('should return inactive status when no session key', async () => {
      vi.mocked(sessionKeyStore.getSessionKey).mockResolvedValue(null);

      const result = await handleSessionKeyTool(
        'smartaccount_getSessionKeyStatus',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.active).toBe(false);
      expect(result.data.sessionKey).toBeNull();
      expect(result.data.dailyLimitUSD).toBe(0);
      expect(result.data.dailySpentUSD).toBe(0);
      expect(result.data.remainingUSD).toBe(0);
      expect(result.data.allowedTargets).toEqual([]);
    });

    it('should calculate remaining correctly when spent exceeds limit', async () => {
      vi.mocked(sessionKeyStore.getSessionKey).mockResolvedValue({
        sessionKeyAddress: testSessionKey,
        smartAccount: testSmartAccount,
        encryptedPrivateKey: 'encrypted',
      });
      vi.mocked(sessionKeyStore.getSessionKeyStatus).mockResolvedValue({
        dailyLimitUSD: 1000,
        dailySpentUSD: 1500,
        expiresAt: new Date().toISOString(),
        allowedTargets: [],
        resetAt: new Date().toISOString(),
      });

      const result = await handleSessionKeyTool(
        'smartaccount_getSessionKeyStatus',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.data.remainingUSD).toBe(0);
    });
  });

  describe('smartaccount_listSessionKeys', () => {
    it('should list active session keys for owner', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const sessionKeys = [
        {
          sessionKeyAddress: testSessionKey,
          dailyLimitUSD: 10000,
          allowedTargets: ['0x1111111111111111111111111111111111111111'],
          expiresAt,
          isActive: true,
        },
      ];

      mockManager.getActiveSessionKeys.mockResolvedValue(sessionKeys);

      const result = await handleSessionKeyTool(
        'smartaccount_listSessionKeys',
        { owner: testOwner },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.keys).toHaveLength(1);
      expect(result.data.keys[0].sessionKey).toBe(testSessionKey);
      expect(result.data.keys[0].dailyLimitUSD).toBe(10000);
    });

    it('should return empty list for owner with no keys', async () => {
      mockManager.getActiveSessionKeys.mockResolvedValue([]);

      const result = await handleSessionKeyTool(
        'smartaccount_listSessionKeys',
        { owner: testOwner },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(0);
      expect(result.data.keys).toEqual([]);
    });

    it('should use userWallet from context if owner not provided', async () => {
      mockManager.getActiveSessionKeys.mockResolvedValue([]);

      const result = await handleSessionKeyTool(
        'smartaccount_listSessionKeys',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
      expect(mockManager.getActiveSessionKeys).toHaveBeenCalledWith(
        expect.stringMatching(/^0x[a-fA-F0-9]{40}$/)
      );
    });
  });

  describe('Error Handling', () => {
    it('should return TOOL_NOT_FOUND for unknown tool', async () => {
      const result = await handleSessionKeyTool(
        'unknown_tool',
        {},
        createContext()
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(MCP_ERRORS.TOOL_NOT_FOUND);
      expect(result.error.message).toContain('unknown_tool');
    });

    it('should include available tools in error message', async () => {
      const result = await handleSessionKeyTool(
        'unknown_tool',
        {},
        createContext()
      );

      expect(result.error.message).toContain('smartaccount_create');
      expect(result.error.message).toContain('smartaccount_getAddress');
    });

    it('should handle insufficient funds error with hint', async () => {
      mockManager.getSmartAccountAddress.mockRejectedValue(
        new Error('insufficient funds for gas')
      );

      const result = await handleSessionKeyTool(
        'smartaccount_create',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(MCP_ERRORS.TOOL_EXECUTION_FAILED);
      expect(result.error.message).toContain('insufficient funds');
      expect(result.error.message).toContain('Hint:');
    });

    it('should handle already deployed error with hint', async () => {
      mockManager.getSmartAccountAddress.mockRejectedValue(
        new Error('account already exists')
      );

      const result = await handleSessionKeyTool(
        'smartaccount_create',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('already exists');
      expect(result.error.message).toContain('Hint:');
    });

    it('should handle rate limit error with hint', async () => {
      mockManager.grantSessionKey.mockRejectedValue(
        new Error('Rate limit exceeded')
      );
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);

      const result = await handleSessionKeyTool(
        'smartaccount_grantSessionKey',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Rate limit');
    });

    it('should handle invalid address error with hint', async () => {
      mockManager.grantSessionKey.mockRejectedValue(
        new Error('invalid address')
      );
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);

      const result = await handleSessionKeyTool(
        'smartaccount_grantSessionKey',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Hint:');
    });
  });

  describe('Context Resolution', () => {
    it('should use userWallet from context as owner', async () => {
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);
      mockManager.isSmartAccountDeployed.mockResolvedValue(true);

      await handleSessionKeyTool(
        'smartaccount_getAddress',
        {},
        createContext({ userWallet: testOwner })
      );

      expect(mockManager.getSmartAccountAddress).toHaveBeenCalledWith(
        expect.stringMatching(/^0x[a-fA-F0-9]{40}$/)
      );
    });

    it('should prefer explicit owner over context userWallet', async () => {
      const explicitOwner = '0x2222222222222222222222222222222222222222';
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);
      mockManager.isSmartAccountDeployed.mockResolvedValue(true);

      await handleSessionKeyTool(
        'smartaccount_getAddress',
        { owner: explicitOwner },
        createContext({ userWallet: testOwner })
      );

      expect(mockManager.getSmartAccountAddress).toHaveBeenCalledWith(
        ethers.getAddress(explicitOwner)
      );
    });
  });

  describe('Security Validation', () => {
    it('should checksum all returned addresses', async () => {
      const lowerOwner = testOwner.toLowerCase();
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);
      mockManager.isSmartAccountDeployed.mockResolvedValue(true);

      const result = await handleSessionKeyTool(
        'smartaccount_getAddress',
        { owner: lowerOwner },
        createContext({ userWallet: lowerOwner })
      );

      expect(result.data.owner).toBe(ethers.getAddress(lowerOwner));
    });

    it('should validate addresses with ethers.isAddress', async () => {
      mockManager.getSmartAccountAddress.mockResolvedValue(testSmartAccount);
      mockManager.grantSessionKey.mockResolvedValue({
        sessionKeyAddress: testSessionKey,
        txHash: '0xgrant',
        encryptedPrivateKey: 'encrypted',
      });

      const result = await handleSessionKeyTool(
        'smartaccount_grantSessionKey',
        { allowedTargets: ['0x1111111111111111111111111111111111111111'] },
        createContext({ userWallet: testOwner })
      );

      expect(result.success).toBe(true);
    });
  });
});
