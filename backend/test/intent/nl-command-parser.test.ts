import { describe, it, expect, beforeEach } from 'vitest';
import { NLCommandParser, IntentResult } from '@/agent/services/NLCommandParser';

describe('NLCommandParser', () => {
  let parser: NLCommandParser;

  beforeEach(() => {
    parser = new NLCommandParser(false);
  });

  describe('HEDGE intent patterns', () => {
    it('should parse "protect my savings"', async () => {
      const result = await parser.parseIntent('protect my savings');
      expect(result.type).toBe('HEDGE');
      expect(result.action).toBe('move_to_stablecoin');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should parse "protect my money"', async () => {
      const result = await parser.parseIntent('protect my money');
      expect(result.type).toBe('HEDGE');
      expect(result.action).toBe('move_to_stablecoin');
    });

    it('should parse "hedge against inflation"', async () => {
      const result = await parser.parseIntent('hedge against inflation');
      expect(result.type).toBe('HEDGE');
      expect(result.action).toBe('move_to_gold');
      expect(result.params.target).toBe('XAUT');
    });

    it('should parse "keep my funds safe"', async () => {
      const result = await parser.parseIntent('keep my funds safe');
      expect(result.type).toBe('HEDGE');
      expect(result.action).toBe('move_to_stablecoin');
    });

    it('should parse "move to stablecoins"', async () => {
      const result = await parser.parseIntent('move to stablecoins');
      expect(result.type).toBe('HEDGE');
      expect(result.action).toBe('move_to_stablecoin');
    });
  });

  describe('YIELD intent patterns', () => {
    it('should parse "grow my money"', async () => {
      const result = await parser.parseIntent('grow my money');
      expect(result.type).toBe('YIELD');
      expect(result.action).toBe('supply_to_aave');
    });

    it('should parse "earn more yield"', async () => {
      const result = await parser.parseIntent('earn more yield');
      expect(result.type).toBe('YIELD');
      expect(result.action).toBe('optimize_yield');
    });

    it('should parse "maximize my returns"', async () => {
      const result = await parser.parseIntent('maximize my returns');
      expect(result.type).toBe('YIELD');
      expect(result.action).toBe('optimize_yield');
    });

    it('should parse "deposit to aave"', async () => {
      const result = await parser.parseIntent('deposit to aave');
      expect(result.type).toBe('YIELD');
      expect(result.action).toBe('supply_to_aave');
    });
  });

  describe('TRANSFER intent patterns', () => {
    it('should parse "send $100 to 0x1234567890123456789012345678901234567890"', async () => {
      const result = await parser.parseIntent('send $100 to 0x1234567890123456789012345678901234567890');
      expect(result.type).toBe('TRANSFER');
      expect(result.action).toBe('transfer_usdt');
      expect(result.params.amount).toBe('100');
      expect(result.params.recipient).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should parse "transfer my USDT"', async () => {
      const result = await parser.parseIntent('transfer my USDT');
      expect(result.type).toBe('TRANSFER');
      expect(result.action).toBe('transfer_usdt');
    });

    it('should parse "bridge to arbitrum"', async () => {
      const result = await parser.parseIntent('bridge to arbitrum');
      expect(result.type).toBe('TRANSFER');
      expect(result.action).toBe('bridge');
    });
  });

  describe('QUERY intent patterns', () => {
    it('should parse "what is my balance"', async () => {
      const result = await parser.parseIntent('what is my balance');
      expect(result.type).toBe('QUERY');
      expect(result.action).toBe('get_balance');
    });

    it('should parse "how much did I earn"', async () => {
      const result = await parser.parseIntent('how much did I earn');
      expect(result.type).toBe('QUERY');
      expect(result.action).toBe('get_yield_info');
    });

    it('should parse "show my portfolio"', async () => {
      const result = await parser.parseIntent('show my portfolio');
      expect(result.type).toBe('QUERY');
      expect(result.action).toBe('get_portfolio');
    });

    it('should parse "what is the current risk"', async () => {
      const result = await parser.parseIntent('what is the current risk');
      expect(result.type).toBe('QUERY');
      expect(result.action).toBe('get_risk_metrics');
    });
  });

  describe('Legacy command fallback', () => {
    it('should parse "supply 100 usdt" as COMMAND', async () => {
      const result = await parser.parseIntent('supply 100 usdt');
      expect(result.type).toBe('COMMAND');
      expect(result.action).toBe('supply');
      expect(result.params.amount).toBe('100');
    });

    it('should parse "status" as COMMAND', async () => {
      const result = await parser.parseIntent('status');
      expect(result.type).toBe('COMMAND');
      expect(result.action).toBe('status');
    });
  });

  describe('Unknown input', () => {
    it('should return unknown for unrecognized input', async () => {
      const result = await parser.parseIntent('foobar xyz 123');
      expect(result.type).toBe('QUERY');
      expect(result.action).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('Case insensitivity', () => {
    it('should handle mixed case input', async () => {
      const result = await parser.parseIntent('PROTECT My Savings');
      expect(result.type).toBe('HEDGE');
      expect(result.action).toBe('move_to_stablecoin');
    });
  });
});
