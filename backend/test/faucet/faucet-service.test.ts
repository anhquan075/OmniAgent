import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FaucetService } from '@/services/FaucetService';

// TestFaucetService overrides blockchain methods to skip real network calls
class TestFaucetService extends FaucetService {
  override async mintUSDT(_to: string): Promise<void> {
    // no-op: skip real USDT transfer on Sepolia
  }
  override async sendGasETH(_to: string): Promise<void> {
    // no-op: skip real ETH send on Sepolia
  }
}

describe('FaucetService', () => {
  let service: FaucetService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    service = new TestFaucetService();
  });

  describe('claim', () => {
    it('should allow eligible user to claim', async () => {
      const testAddr = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'; // Hardhat account #9
      const result = await service.claim(testAddr, '192.168.1.1');
      expect(result).toBeDefined();
      expect(result.walletAddress.toLowerCase()).toBe(testAddr.toLowerCase());
      expect(result.tokens.usdt).toBe(10000n * 10n ** 6n);
    });

    it('should reject claim within cooldown period', async () => {
      const testAddr = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'; // Hardhat account #8
      await service.claim(testAddr, '192.168.1.2');
      await expect(
        service.claim(testAddr, '192.168.1.2')
      ).rejects.toThrow('Rate limited');
    });
  });

  describe('isEligible', () => {
    it('should return true for new address', async () => {
      const newAddr = '0x976EA74026E726554dB657fA54763abd0C3a0aa9'; // Hardhat account #7
      const eligible = await service.isEligible(newAddr, '192.168.1.3');
      expect(eligible).toBe(true);
    });

    it('should return false for recently claimed address', async () => {
      const testAddr = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'; // Hardhat account #6
      await service.claim(testAddr, '192.168.1.4');
      const eligible = await service.isEligible(testAddr, '192.168.1.4');
      expect(eligible).toBe(false);
    });
  });

  describe('getLastClaim', () => {
    it('should return null for address that never claimed', async () => {
      const neverClaimed = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f'; // Hardhat account #5
      const lastClaim = await service.getLastClaim(neverClaimed);
      expect(lastClaim).toBeNull();
    });

    it('should return claim for claimed address', async () => {
      const testAddr = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720'; // Hardhat account #4
      await service.claim(testAddr, '192.168.1.5');
      const lastClaim = await service.getLastClaim(testAddr);
      expect(lastClaim).toBeTruthy();
      expect(lastClaim?.walletAddress.toLowerCase()).toBe(testAddr.toLowerCase());
    });
  });
});
