import { describe, it, expect } from 'vitest';
import { PaymentGate, AccessTier } from '../../src/agent/services/PaymentGate';

describe('[SMOKE] x402 Payment Integration', () => {
  describe('AccessTier enum', () => {
    it('has correct tier values', () => {
      expect(AccessTier.ANONYMOUS).toBe('anonymous');
      expect(AccessTier.AUTHENTICATED).toBe('authenticated');
      expect(AccessTier.OPERATOR).toBe('operator');
    });
  });

  describe('PaymentGate tier pricing', () => {
    const gate = new PaymentGate('0x1234', '0x5678');

    it('anonymous tier is free', () => {
      expect(gate.getTierPrice(AccessTier.ANONYMOUS)).toBe(0n);
    });

    it('authenticated tier costs 1 USDT', () => {
      expect(gate.getTierPrice(AccessTier.AUTHENTICATED)).toBe(1_000_000n);
    });

    it('operator tier is free', () => {
      expect(gate.getTierPrice(AccessTier.OPERATOR)).toBe(0n);
    });
  });

  describe('Cost estimation', () => {
    const gate = new PaymentGate('0x1234', '0x5678');

    it('estimates cost for authenticated tier', async () => {
      const cost = await gate.estimateCost(AccessTier.AUTHENTICATED, 10);
      expect(cost).toBe(10_000_000n);
    });

    it('operator tier has zero cost', async () => {
      const cost = await gate.estimateCost(AccessTier.OPERATOR, 100);
      expect(cost).toBe(0n);
    });
  });
});
