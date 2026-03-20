import { describe, it, expect } from 'vitest';
import { FinalOutcome, TransactionInput } from '../../src/agent/services/GovernancePipeline';

describe('[SMOKE] Governance Pipeline', () => {
  describe('FinalOutcome enum', () => {
    it('has correct outcome values', () => {
      expect(FinalOutcome.AUTO_APPROVE).toBe('auto_approve');
      expect(FinalOutcome.FLAG_FOR_REVIEW).toBe('flag_for_review');
      expect(FinalOutcome.REJECT).toBe('reject');
    });
  });

  describe('TransactionInput interface', () => {
    it('accepts valid transaction types', () => {
      const validTypes = ['supply', 'withdraw', 'swap', 'transfer', 'bridge'];
      validTypes.forEach(type => {
        const input: TransactionInput = {
          toAddress: '0x1234567890123456789012345678901234567890',
          amount: '1000000',
          transactionType: type as 'supply' | 'withdraw' | 'swap' | 'transfer' | 'bridge'
        };
        expect(input.transactionType).toBe(type);
      });
    });
  });
});
