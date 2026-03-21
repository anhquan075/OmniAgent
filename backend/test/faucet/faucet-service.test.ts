import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('ethers', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    parseEther: vi.fn((val: string) => BigInt(Math.floor(parseFloat(val) * 1e18))),
    formatEther: vi.fn((val: bigint) => (Number(val) / 1e18).toString()),
  };
});

import { FaucetService } from '@/services/FaucetService';

describe('FaucetService', () => {
  let service: FaucetService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FaucetService();
  });

  describe('claim', () => {
    it('should allow eligible user to claim', async () => {
      const result = await service.claim('0xTestAddress123', '192.168.1.1');
      expect(result).toBeDefined();
      expect(result.walletAddress).toBe('0xtestaddress123');
      expect(result.tokens.usdt).toBe(10000n * 10n ** 6n);
    });

    it('should reject claim within cooldown period', async () => {
      await service.claim('0xTestAddress123', '192.168.1.1');
      await expect(
        service.claim('0xTestAddress123', '192.168.1.1')
      ).rejects.toThrow('Rate limited');
    });
  });

  describe('isEligible', () => {
    it('should return true for new address', async () => {
      const eligible = await service.isEligible('0xNewAddress123', '192.168.1.1');
      expect(eligible).toBe(true);
    });

    it('should return false for recently claimed address', async () => {
      await service.claim('0xTestAddress123', '192.168.1.1');
      const eligible = await service.isEligible('0xTestAddress123', '192.168.1.1');
      expect(eligible).toBe(false);
    });
  });

  describe('getLastClaim', () => {
    it('should return null for address that never claimed', async () => {
      const lastClaim = await service.getLastClaim('0xNeverClaimed');
      expect(lastClaim).toBeNull();
    });

    it('should return claim for claimed address', async () => {
      await service.claim('0xTestAddress123', '192.168.1.1');
      const lastClaim = await service.getLastClaim('0xTestAddress123');
      expect(lastClaim).toBeTruthy();
      expect(lastClaim?.walletAddress).toBe('0xtestaddress123');
    });
  });
});
