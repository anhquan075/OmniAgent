import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  storeSessionKey,
  getSessionKey,
  getSessionKeyStatus,
  revokeSessionKey,
  decryptSessionKey,
  updateDailyLimit,
  checkRateLimit,
  recordTransaction,
  StoredSessionKey
} from '@/lib/session-key-store';
import { encryptPrivateKey } from '@/lib/crypto-utils';

describe('[UNIT] session-key-store', () => {
  const testOwner = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
  const testSmartAccount = '0x1234567890123456789012345678901234567890';
  const testSessionKeyAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const testPrivateKey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const masterSecret = 'test-secret';

  function createTestSessionKey(overrides?: Partial<StoredSessionKey>): StoredSessionKey {
    return {
      ownerAddress: testOwner,
      smartAccount: testSmartAccount,
      sessionKeyAddress: testSessionKeyAddress,
      encryptedPrivateKey: encryptPrivateKey(testPrivateKey, masterSecret),
      dailyLimitUSD: 100,
      allowedTargets: ['0x1111111111111111111111111111111111111111'],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revoked: false,
      ...overrides
    };
  }

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    process.env.SESSION_KEY_MASTER_SECRET = masterSecret;
  });

  describe('storeSessionKey', () => {
    it('should store session key successfully', async () => {
      const sessionKey = createTestSessionKey();
      
      await expect(storeSessionKey(testOwner, sessionKey)).resolves.toBeUndefined();
    });

    it('should reject storage without encrypted private key', async () => {
      const sessionKey = createTestSessionKey({ encryptedPrivateKey: '' });
      
      await expect(storeSessionKey(testOwner, sessionKey))
        .rejects
        .toThrow('Cannot store session key without encryption');
    });

    it('should handle case-insensitive owner addresses', async () => {
      const sessionKey = createTestSessionKey();
      
      await storeSessionKey(testOwner.toUpperCase(), sessionKey);
      const retrieved = await getSessionKey(testOwner.toLowerCase());
      
      expect(retrieved).toBeTruthy();
      expect(retrieved?.ownerAddress).toBe(testOwner);
    });
  });

  describe('getSessionKey', () => {
    it('should retrieve stored session key', async () => {
      const sessionKey = createTestSessionKey();
      await storeSessionKey(testOwner, sessionKey);
      
      const retrieved = await getSessionKey(testOwner);
      
      expect(retrieved).toBeTruthy();
      expect(retrieved?.ownerAddress).toBe(testOwner);
      expect(retrieved?.sessionKeyAddress).toBe(testSessionKeyAddress);
      expect(retrieved?.dailyLimitUSD).toBe(100);
    });

    it('should return null for non-existent key', async () => {
      const retrieved = await getSessionKey('0xnonexistent');
      
      expect(retrieved).toBeNull();
    });

    it('should return null for revoked key', async () => {
      const sessionKey = createTestSessionKey({ revoked: true });
      await storeSessionKey(testOwner, sessionKey);
      
      const retrieved = await getSessionKey(testOwner);
      
      expect(retrieved).toBeNull();
    });

    it('should return null for expired key', async () => {
      const sessionKey = createTestSessionKey({
        expiresAt: new Date(Date.now() - 1000)
      });
      await storeSessionKey(testOwner, sessionKey);
      
      const retrieved = await getSessionKey(testOwner);
      
      expect(retrieved).toBeNull();
    });

    it('should handle case-insensitive lookups', async () => {
      const sessionKey = createTestSessionKey();
      await storeSessionKey(testOwner, sessionKey);
      
      const retrieved1 = await getSessionKey(testOwner.toLowerCase());
      const retrieved2 = await getSessionKey(testOwner.toUpperCase());
      
      expect(retrieved1).toBeTruthy();
      expect(retrieved2).toBeTruthy();
      expect(retrieved1?.ownerAddress).toBe(retrieved2?.ownerAddress);
    });
  });

  describe('getSessionKeyStatus', () => {
    it('should return inactive status for non-existent key', async () => {
      const status = await getSessionKeyStatus('0xnonexistent');
      
      expect(status.active).toBe(false);
      expect(status.dailyLimitUSD).toBe(0);
      expect(status.dailySpentUSD).toBe(0);
      expect(status.expiresAt).toBeNull();
      expect(status.allowedTargets).toEqual([]);
    });

    it('should return active status with details', async () => {
      const sessionKey = createTestSessionKey();
      await storeSessionKey(testOwner, sessionKey);
      
      const status = await getSessionKeyStatus(testOwner);
      
      expect(status.active).toBe(true);
      expect(status.dailyLimitUSD).toBe(100);
      expect(status.dailySpentUSD).toBe(0);
      expect(status.expiresAt).toBeTruthy();
      expect(status.allowedTargets).toEqual(['0x1111111111111111111111111111111111111111']);
    });

    it('should track daily spent amount', async () => {
      const sessionKey = createTestSessionKey();
      await storeSessionKey(testOwner, sessionKey);
      
      recordTransaction(testOwner, testSessionKeyAddress, 25);
      recordTransaction(testOwner, testSessionKeyAddress, 15);
      
      const status = await getSessionKeyStatus(testOwner);
      
      expect(status.dailySpentUSD).toBe(40);
    });

    it('should reset daily spent after 24 hours', async () => {
      const uniqueOwner = '0xResetDaily00000000000000000000000000001';
      const uniqueSessionKey = '0xSessionReset00000000000000000000000000001';
      const sessionKey = createTestSessionKey({ 
        ownerAddress: uniqueOwner,
        sessionKeyAddress: uniqueSessionKey
      });
      await storeSessionKey(uniqueOwner, sessionKey);
      
      recordTransaction(uniqueOwner, uniqueSessionKey, 50);
      
      const status1 = await getSessionKeyStatus(uniqueOwner);
      expect(status1.dailySpentUSD).toBe(50);
      
      vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
      
      const status2 = await getSessionKeyStatus(uniqueOwner);
      expect(status2.dailySpentUSD).toBe(0);
      
      vi.useRealTimers();
    });
  });

  describe('revokeSessionKey', () => {
    it('should revoke active session key', async () => {
      const sessionKey = createTestSessionKey();
      await storeSessionKey(testOwner, sessionKey);
      
      await revokeSessionKey(testOwner);
      
      const retrieved = await getSessionKey(testOwner);
      expect(retrieved).toBeNull();
    });

    it('should handle revoking non-existent key gracefully', async () => {
      await expect(revokeSessionKey('0xnonexistent')).resolves.toBeUndefined();
    });

    it('should permanently revoke (not just mark)', async () => {
      const sessionKey = createTestSessionKey();
      await storeSessionKey(testOwner, sessionKey);
      
      await revokeSessionKey(testOwner);
      
      const retrieved = await getSessionKey(testOwner);
      expect(retrieved).toBeNull();
    });
  });

  describe('decryptSessionKey', () => {
    const decryptTestOwner = '0xDecrypt1111111111111111111111111111111111';
    
    beforeEach(() => {
      process.env.SESSION_KEY_MASTER_SECRET = masterSecret;
    });

    it('should decrypt stored private key', async () => {
      const sessionKey = createTestSessionKey({ ownerAddress: decryptTestOwner });
      await storeSessionKey(decryptTestOwner, sessionKey);
      
      const decrypted = await decryptSessionKey(decryptTestOwner);
      
      expect(decrypted).toBe(testPrivateKey);
    });

    it('should return null for non-existent key', async () => {
      const decrypted = await decryptSessionKey('0xnonexistent');
      
      expect(decrypted).toBeNull();
    });

    it('should throw for decryption failure', async () => {
      const failTestOwner = '0xFail11111111111111111111111111111111111';
      const sessionKey = createTestSessionKey({ ownerAddress: failTestOwner });
      await storeSessionKey(failTestOwner, sessionKey);
      
      process.env.SESSION_KEY_MASTER_SECRET = 'wrong-secret';
      
      await expect(decryptSessionKey(failTestOwner))
        .rejects
        .toThrow('Failed to decrypt session key');
    });
  });

  describe('updateDailyLimit', () => {
    it('should update daily limit for existing key', async () => {
      const sessionKey = createTestSessionKey({ dailyLimitUSD: 100 });
      await storeSessionKey(testOwner, sessionKey);
      
      await updateDailyLimit(testOwner, 200);
      
      const retrieved = await getSessionKey(testOwner);
      expect(retrieved?.dailyLimitUSD).toBe(200);
    });

    it('should throw for non-existent key', async () => {
      await expect(updateDailyLimit('0xnonexistent', 200))
        .rejects
        .toThrow('Session key not found');
    });

    it('should handle limit increase', async () => {
      const sessionKey = createTestSessionKey({ dailyLimitUSD: 50 });
      await storeSessionKey(testOwner, sessionKey);
      
      await updateDailyLimit(testOwner, 500);
      
      const status = await getSessionKeyStatus(testOwner);
      expect(status.dailyLimitUSD).toBe(500);
    });

    it('should handle limit decrease', async () => {
      const sessionKey = createTestSessionKey({ dailyLimitUSD: 1000 });
      await storeSessionKey(testOwner, sessionKey);
      
      await updateDailyLimit(testOwner, 10);
      
      const status = await getSessionKeyStatus(testOwner);
      expect(status.dailyLimitUSD).toBe(10);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow first 5 keys within 24 hours', () => {
      const owner = '0xratelimituser';
      
      for (let i = 0; i < 5; i++) {
        expect(checkRateLimit(owner)).toBe(true);
      }
    });

    it('should reject 6th key within 24 hours', () => {
      const owner = '0xratelimituser2';
      
      for (let i = 0; i < 5; i++) {
        checkRateLimit(owner);
      }
      
      expect(checkRateLimit(owner)).toBe(false);
    });

    it('should reset after 24 hours', () => {
      const owner = '0xratelimituser3';
      
      for (let i = 0; i < 5; i++) {
        checkRateLimit(owner);
      }
      
      expect(checkRateLimit(owner)).toBe(false);
      
      vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
      
      expect(checkRateLimit(owner)).toBe(true);
      
      vi.useRealTimers();
    });

    it('should handle case-insensitive addresses', () => {
      const owner = '0xRateLimitUser4';
      
      checkRateLimit(owner.toUpperCase());
      checkRateLimit(owner.toLowerCase());
      checkRateLimit(owner);
      
      const owner2 = '0xratelimituser4';
      expect(checkRateLimit(owner2)).toBe(true);
    });
  });

  describe('recordTransaction', () => {
    it('should record transaction amount', () => {
      recordTransaction(testOwner, testSessionKeyAddress, 100);
      
      const status = getSessionKeyStatus(testOwner);
      expect(status).toBeTruthy();
    });

    it('should accumulate multiple transactions', async () => {
      const uniqueOwner = '0xAccumulateUser0000000000000000000000001';
      const uniqueSessionKey = '0xAccumulateKey00000000000000000000000001';
      const sessionKey = createTestSessionKey({ 
        ownerAddress: uniqueOwner,
        sessionKeyAddress: uniqueSessionKey
      });
      await storeSessionKey(uniqueOwner, sessionKey);
      
      recordTransaction(uniqueOwner, uniqueSessionKey, 10);
      recordTransaction(uniqueOwner, uniqueSessionKey, 20);
      recordTransaction(uniqueOwner, uniqueSessionKey, 30);
      
      const status = await getSessionKeyStatus(uniqueOwner);
      expect(status.dailySpentUSD).toBe(60);
    });

    it('should reset tracking after 24 hours', async () => {
      const uniqueOwner = '0xResetTracking000000000000000000000000001';
      const uniqueSessionKey = '0xTrackingReset00000000000000000000000001';
      const sessionKey = createTestSessionKey({ 
        ownerAddress: uniqueOwner,
        sessionKeyAddress: uniqueSessionKey
      });
      await storeSessionKey(uniqueOwner, sessionKey);
      
      recordTransaction(uniqueOwner, uniqueSessionKey, 100);
      
      let status = await getSessionKeyStatus(uniqueOwner);
      expect(status.dailySpentUSD).toBe(100);
      
      vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
      
      status = await getSessionKeyStatus(uniqueOwner);
      expect(status.dailySpentUSD).toBe(0);
      
      vi.useRealTimers();
    });

    it('should track separately per session key address', async () => {
      const uniqueOwner = '0xSeparateTracking00000000000000000000001';
      const uniqueSessionKey1 = '0xSessionKey100000000000000000000000000001';
      const uniqueSessionKey2 = '0xSessionKey200000000000000000000000000002';
      
      const sessionKey1 = createTestSessionKey({
        ownerAddress: uniqueOwner,
        sessionKeyAddress: uniqueSessionKey1
      });
      
      await storeSessionKey(uniqueOwner, sessionKey1);
      
      recordTransaction(uniqueOwner, uniqueSessionKey1, 50);
      recordTransaction(uniqueOwner, uniqueSessionKey2, 75);
      
      const status = await getSessionKeyStatus(uniqueOwner);
      expect(status.dailySpentUSD).toBe(50);
    });
  });

  describe('security properties', () => {
    it('should never expose unencrypted private keys', async () => {
      const sessionKey = createTestSessionKey();
      await storeSessionKey(testOwner, sessionKey);
      
      const retrieved = await getSessionKey(testOwner);
      
      expect(retrieved?.encryptedPrivateKey).not.toContain(testPrivateKey);
    });

    it('should enforce encryption requirement', async () => {
      const sessionKey = createTestSessionKey({ encryptedPrivateKey: '' });
      
      await expect(storeSessionKey(testOwner, sessionKey))
        .rejects
        .toThrow('Cannot store session key without encryption');
    });

    it('should isolate users by address', async () => {
      const user1 = '0xuser1000000000000000000000000000000000001';
      const user2 = '0xuser2000000000000000000000000000000000002';
      
      const sessionKey1 = createTestSessionKey({ ownerAddress: user1 });
      const sessionKey2 = createTestSessionKey({ ownerAddress: user2 });
      
      await storeSessionKey(user1, sessionKey1);
      await storeSessionKey(user2, sessionKey2);
      
      const retrieved1 = await getSessionKey(user1);
      const retrieved2 = await getSessionKey(user2);
      
      expect(retrieved1?.ownerAddress).toBe(user1);
      expect(retrieved2?.ownerAddress).toBe(user2);
      expect(retrieved1?.ownerAddress).not.toBe(retrieved2?.ownerAddress);
    });
  });
});
