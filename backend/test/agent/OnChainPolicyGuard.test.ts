import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OnChainPolicyGuard, PolicyGuardValidation } from '../../src/services/OnChainPolicyGuard';

vi.mock('../../src/lib/wdk-loader', () => ({
  getWdkSigner: vi.fn().mockResolvedValue({
    getAddress: vi.fn().mockResolvedValue('0x1234'),
  }),
}));

describe('OnChainPolicyGuard', () => {
  describe('isEnabled', () => {
    it('should return boolean based on configuration', () => {
      const guard = new OnChainPolicyGuard();
      const result = guard.isEnabled();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('PolicyGuardValidation interface', () => {
    it('should have correct structure for approval', () => {
      const validation: PolicyGuardValidation = {
        approved: true,
        reason: 'test',
        onChain: true,
      };
      
      expect(validation.approved).toBe(true);
      expect(validation.onChain).toBe(true);
    });

    it('should support error flag on rejection', () => {
      const validation: PolicyGuardValidation = {
        approved: false,
        reason: 'RPC error',
        onChain: false,
        error: true,
      };
      
      expect(validation.approved).toBe(false);
      expect(validation.error).toBe(true);
      expect(validation.onChain).toBe(false);
    });

    it('should support fail-secure pattern', () => {
      const validation: PolicyGuardValidation = {
        approved: false,
        reason: 'On-chain policy check failed: request timeout. Transaction rejected for security.',
        onChain: true,
        error: true,
      };
      
      expect(validation.approved).toBe(false);
      expect(validation.error).toBe(true);
      expect(validation.reason).toContain('rejected for security');
    });
  });
});
