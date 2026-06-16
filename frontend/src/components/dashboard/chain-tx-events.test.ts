import { describe, expect, it } from 'vitest';
import { proofLogEvents } from './chain-tx-events';

describe('proofLogEvents', () => {
  it('includes verified registration proof before trade tx events', () => {
    const result = proofLogEvents({
      competition: {
        registrationProof: {
          eventType: 'competition_registered',
          txHash: '0x' + 'c'.repeat(64),
          receiptProof: { valid: true },
        },
      },
    }, [{ eventType: 'trade_executed', txHash: '0x' + 'd'.repeat(64) }]);

    expect(result).toHaveLength(2);
    expect(result[0].eventType).toBe('competition_registered');
    expect(result[0].proofStatus).toBe('verified');
    expect(result[1].eventType).toBe('trade_executed');
  });

  it('dedupes registration hash already present in ledger events', () => {
    const hash = '0x' + 'c'.repeat(64);
    const result = proofLogEvents({
      competition: { registrationProof: { txHash: hash, statusProof: { valid: true } } },
    }, [{ eventType: 'competition_registered', txHash: hash }]);

    expect(result).toHaveLength(1);
    expect(result[0].proofStatus).toBe('verified');
  });
});
