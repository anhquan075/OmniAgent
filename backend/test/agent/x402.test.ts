import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentGate, AccessTier, getPaymentGate, PaymentReceipt } from '../../src/agent/services/PaymentGate';

describe('PaymentGate', () => {
  let paymentGate: PaymentGate;
  const PROVIDER = '0x1234567890123456789012345678901234567890';
  const REGISTRY = '0x0000000000000000000000000000000000000001';

  beforeEach(() => {
    paymentGate = new PaymentGate(PROVIDER, REGISTRY);
    vi.clearAllMocks();
  });

  describe('getAccessTier', () => {
    it('should return OPERATOR for provider address', async () => {
      const tier = await paymentGate.getAccessTier(PROVIDER);
      expect(tier).toBe(AccessTier.OPERATOR);
    });

    it('should return AUTHENTICATED for non-provider address', async () => {
      const user = '0x9999999999999999999999999999999999999999';
      const tier = await paymentGate.getAccessTier(user);
      expect(tier).toBe(AccessTier.AUTHENTICATED);
    });
  });

  describe('validatePayment', () => {
    it('should reject unverified receipt', async () => {
      const receipt: PaymentReceipt = {
        txHash: '0xabc',
        amount: 1000000,
        token: 'USDT',
        timestamp: Date.now(),
        recipient: PROVIDER,
        verified: false
      };

      const result = await paymentGate.validatePayment(receipt);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not verified');
    });

    it('should accept verified receipt', async () => {
      const receipt: PaymentReceipt = {
        txHash: '0xabc',
        amount: 1000000,
        token: 'USDT',
        timestamp: Date.now(),
        recipient: PROVIDER,
        verified: true
      };

      const result = await paymentGate.validatePayment(receipt);
      expect(result.valid).toBe(true);
      expect(result.tier).toBe(AccessTier.OPERATOR);
    });
  });

  describe('checkTierLimit', () => {
    it('should allow when under limit', async () => {
      const result = await paymentGate.checkTierLimit(
        '0x123',
        AccessTier.AUTHENTICATED,
        50_000_000_000n
      );
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(50_000_000_000n);
    });

    it('should reject when at limit', async () => {
      const result = await paymentGate.checkTierLimit(
        '0x123',
        AccessTier.AUTHENTICATED,
        100_000_000_000n
      );
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0n);
    });
  });

  describe('getTierPrice', () => {
    it('should return correct prices for each tier', () => {
      expect(paymentGate.getTierPrice(AccessTier.ANONYMOUS)).toBe(0n);
      expect(paymentGate.getTierPrice(AccessTier.AUTHENTICATED)).toBe(1_000_000n);
      expect(paymentGate.getTierPrice(AccessTier.OPERATOR)).toBe(0n);
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost correctly', async () => {
      const cost = await paymentGate.estimateCost(AccessTier.AUTHENTICATED, 10);
      expect(cost).toBe(10_000_000n);
    });

    it('should return 0 for OPERATOR tier', async () => {
      const cost = await paymentGate.estimateCost(AccessTier.OPERATOR, 100);
      expect(cost).toBe(0n);
    });
  });

  describe('getPaymentGate singleton', () => {
    it('should return same instance', () => {
      const gate1 = getPaymentGate();
      const gate2 = getPaymentGate();
      expect(gate1).toBe(gate2);
    });
  });
});

describe('AccessTier enum', () => {
  it('should have correct values', () => {
    expect(AccessTier.ANONYMOUS).toBe('anonymous');
    expect(AccessTier.AUTHENTICATED).toBe('authenticated');
    expect(AccessTier.OPERATOR).toBe('operator');
  });
});
