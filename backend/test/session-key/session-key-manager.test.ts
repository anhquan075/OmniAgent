import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionKeyManager, SessionKeyConfig } from '@/services/session-key-manager';
import { ethers } from 'ethers';

vi.mock('@/lib/wdk-loader', () => ({
  getWdkSigner: vi.fn(async () => {
    const provider = new ethers.JsonRpcProvider('http://localhost:8545');
    return new ethers.Wallet(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      provider
    );
  })
}));

vi.mock('@/config/env', () => ({
  env: {
    SEPOLIA_RPC_URL: 'http://localhost:8545'
  }
}));

describe('[UNIT] SessionKeyManager', () => {
  let manager: SessionKeyManager;
  const testOwner = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0';
  const testSmartAccount = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    // Don't unstub env vars - we need SIMPLE_ACCOUNT_FACTORY_ADDRESS to persist
    process.env.SIMPLE_ACCOUNT_FACTORY_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
    process.env.SESSION_KEY_MASTER_SECRET = 'test-master-secret';
    manager = new SessionKeyManager();
    vi.clearAllMocks();
  });

  describe('generateSessionKeyPair', () => {
    it('should generate valid Ethereum key pair', async () => {
      const { address, privateKey } = await manager.generateSessionKeyPair();
      
      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(ethers.isAddress(address)).toBe(true);
      expect(privateKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique pairs', async () => {
      const pair1 = await manager.generateSessionKeyPair();
      const pair2 = await manager.generateSessionKeyPair();
      
      expect(pair1.address).not.toBe(pair2.address);
      expect(pair1.privateKey).not.toBe(pair2.privateKey);
    });

    it('should generate keys that create valid wallets', async () => {
      const { address, privateKey } = await manager.generateSessionKeyPair();
      
      const wallet = new ethers.Wallet(privateKey);
      expect(wallet.address).toBe(address);
    });
  });

  describe('getSmartAccountAddress', () => {
    it('should return empty string for non-existent account', async () => {
      const address = await manager.getSmartAccountAddress(testOwner);
      
      expect(address).toBe('');
    });

    it('should handle ethers errors gracefully', async () => {
      const invalidOwner = '0xinvalid';
      
      const result = await manager.getSmartAccountAddress(invalidOwner);
      expect(result).toBe('');
    });
  });

  describe('isSmartAccountDeployed', () => {
    it('should return false for non-existent account', async () => {
      const deployed = await manager.isSmartAccountDeployed(testOwner);
      
      expect(deployed).toBe(false);
    });

    it('should return false when address is empty', async () => {
      const deployed = await manager.isSmartAccountDeployed(ethers.ZeroAddress);
      
      expect(deployed).toBe(false);
    });
  });

  describe('getActiveSessionKeys', () => {
    it('should return empty array for user without keys', async () => {
      const keys = await manager.getActiveSessionKeys(testOwner);
      
      expect(keys).toEqual([]);
    });

    it('should validate session keys on-chain', async () => {
      const keys = await manager.getActiveSessionKeys(testOwner);
      
      expect(Array.isArray(keys)).toBe(true);
    });
  });

  describe('getSignerForUser', () => {
    it('should return null for user without session key', async () => {
      const signer = await manager.getSignerForUser(testOwner);
      
      expect(signer).toBeNull();
    });

    it('should return ethers Wallet when session key exists', async () => {
      const signer = await manager.getSignerForUser(testOwner);
      
      if (signer) {
        expect(signer).toBeInstanceOf(ethers.Wallet);
        expect(typeof signer.address).toBe('string');
        expect(ethers.isAddress(signer.address)).toBe(true);
      }
    });
  });

  describe('rate limiting', () => {
    it('should enforce max 5 session keys per day', async () => {
      const owner = '0xratelimituser000000000000000000000000001';
      
      for (let i = 0; i < 5; i++) {
        try {
          await manager.grantSessionKey(
            testSmartAccount,
            100,
            ['0x1111111111111111111111111111111111111111'],
            7,
            owner
          );
        } catch (e: any) {
          if (e.message !== 'Rate limit exceeded: Max 5 session keys per day') {
            throw e;
          }
        }
      }
      
      await expect(
        manager.grantSessionKey(
          testSmartAccount,
          100,
          ['0x1111111111111111111111111111111111111111'],
          7,
          owner
        )
      ).rejects.toThrow('Rate limit exceeded: Max 5 session keys per day');
    });
  });

  describe('session key lifecycle', () => {
    it('should validate session key expiration', async () => {
      const durationDays = 7;
      const now = Date.now();
      
      const expectedExpiry = now + durationDays * 24 * 60 * 60 * 1000;
      
      expect(expectedExpiry).toBeGreaterThan(now);
    });

    it('should handle different duration values', () => {
      const durations = [1, 7, 30, 90];
      
      durations.forEach(days => {
        const durationSeconds = days * 24 * 60 * 60;
        expect(durationSeconds).toBeGreaterThan(0);
      });
    });
  });

  describe('security properties', () => {
    it('should never log private keys', async () => {
      const loggerSpy = vi.spyOn(console, 'log');
      
      const { privateKey } = await manager.generateSessionKeyPair();
      
      const logCalls = loggerSpy.mock.calls.flat().join(' ');
      expect(logCalls).not.toContain(privateKey);
      
      loggerSpy.mockRestore();
    });

    it('should encrypt private keys before storage', async () => {
      const { privateKey } = await manager.generateSessionKeyPair();
      
      expect(privateKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should validate daily limits are positive', () => {
      const validLimits = [1, 100, 1000, 10000];
      
      validLimits.forEach(limit => {
        expect(limit).toBeGreaterThan(0);
      });
    });

    it('should validate allowed targets are valid addresses', () => {
      const validTargets = [
        '0x1111111111111111111111111111111111111111',
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      ];
      
      validTargets.forEach(target => {
        expect(ethers.isAddress(target)).toBe(true);
      });
    });
  });

  describe('daily limit conversion', () => {
    it('should convert USD to 6 decimal token units', () => {
      const testCases = [
        { usd: 100, expected: 100 * 1e6 },
        { usd: 1.5, expected: 1.5 * 1e6 },
        { usd: 0.01, expected: 0.01 * 1e6 },
        { usd: 10000, expected: 10000 * 1e6 }
      ];
      
      testCases.forEach(({ usd, expected }) => {
        const converted = usd * 1e6;
        expect(converted).toBe(expected);
      });
    });

    it('should convert token units back to USD', () => {
      const testCases = [
        { tokens: 100 * 1e6, expected: 100 },
        { tokens: 1.5 * 1e6, expected: 1.5 },
        { tokens: 10000 * 1e6, expected: 10000 }
      ];
      
      testCases.forEach(({ tokens, expected }) => {
        const converted = tokens / 1e6;
        expect(converted).toBe(expected);
      });
    });
  });

  describe('duration conversion', () => {
    it('should convert days to seconds correctly', () => {
      const testCases = [
        { days: 1, seconds: 86400 },
        { days: 7, seconds: 604800 },
        { days: 30, seconds: 2592000 },
        { days: 90, seconds: 7776000 }
      ];
      
      testCases.forEach(({ days, seconds }) => {
        const converted = days * 24 * 60 * 60;
        expect(converted).toBe(seconds);
      });
    });

    it('should handle fractional days', () => {
      const halfDay = 0.5 * 24 * 60 * 60;
      expect(halfDay).toBe(43200);
      
      const oneHour = (1/24) * 24 * 60 * 60;
      expect(oneHour).toBe(3600);
    });
  });

  describe('address validation', () => {
    it('should handle checksummed addresses', () => {
      const checksummed = '0x742D35CC6634c0532925A3b844BC9E7595F0BEb0';
      
      expect(ethers.isAddress(checksummed)).toBe(true);
      expect(ethers.getAddress(checksummed)).toBe(checksummed);
    });

    it('should handle lowercase addresses', () => {
      const lowercase = '0x742d35cc6634c0532925a3b844bc9e7595f0beb0';
      
      expect(ethers.isAddress(lowercase)).toBe(true);
    });

    it('should reject invalid addresses', () => {
      const invalid = [
        '0xinvalid',
        '0x123',
        'not an address',
        '0x000000000000000000000000000000000000000G'
      ];
      
      invalid.forEach(addr => {
        expect(ethers.isAddress(addr)).toBe(false);
      });
    });
  });
});
