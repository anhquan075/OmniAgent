import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveScheduler } from '../../src/agent/services/AdaptiveScheduler';
import { NLCommandParser } from '../../src/agent/services/NLCommandParser';
import { StatePersistence } from '../../src/agent/services/StatePersistence';

describe('[SMOKE] Adaptive Features', () => {
  describe('AdaptiveScheduler', () => {
    let scheduler: AdaptiveScheduler;

    beforeEach(() => {
      scheduler = new AdaptiveScheduler();
    });

    it('returns correct default config', () => {
      const config = scheduler.getConfig();
      expect(config.highAlertIntervalMs).toBe(30_000);
      expect(config.moderateIntervalMs).toBe(300_000);
      expect(config.stableIntervalMs).toBe(3_600_000);
    });

    it('returns zero volatility when no history', () => {
      const stats = scheduler.getVolatilityStats();
      expect(stats.current).toBe(0);
      expect(stats.sampleSize).toBe(0);
    });

    it('can update config', () => {
      scheduler.updateConfig({ highAlertIntervalMs: 10_000 });
      const config = scheduler.getConfig();
      expect(config.highAlertIntervalMs).toBe(10_000);
    });
  });

  describe('NLCommandParser', () => {
    let parser: NLCommandParser;

    beforeEach(() => {
      parser = new NLCommandParser(false);
    });

    it('parses supply command', async () => {
      const result = await parser.parse('supply 100 USDT');
      expect(result.action).toBe('supply');
      expect(result.params.amount).toBe('100');
      expect(result.params.token).toBe('USDT');
    });

    it('parses withdraw command', async () => {
      const result = await parser.parse('withdraw 50 USDT');
      expect(result.action).toBe('withdraw');
      expect(result.params.amount).toBe('50');
    });

    it('parses status command', async () => {
      const result = await parser.parse('status');
      expect(result.action).toBe('status');
    });

    it('returns unknown for gibberish', async () => {
      const result = await parser.parse('asdfghjkl qwerty');
      expect(result.action).toBe('unknown');
    });
  });

  describe('StatePersistence', () => {
    let persistence: StatePersistence;

    beforeEach(() => {
      persistence = new StatePersistence('/tmp/smoke-test-state.json');
    });

    it('returns default state', () => {
      const state = persistence.get();
      expect(state.lastAction).toBe('init');
      expect(state.consecutiveFailures).toBe(0);
    });

    it('updates state', () => {
      persistence.update({ lastAction: 'supply', consecutiveFailures: 2 });
      const state = persistence.get();
      expect(state.lastAction).toBe('supply');
      expect(state.consecutiveFailures).toBe(2);
    });

    it('increments failures', () => {
      persistence.resetFailures();
      persistence.incrementFailures();
      persistence.incrementFailures();
      expect(persistence.getKey('consecutiveFailures')).toBe(2);
    });

    it('resets failures', () => {
      persistence.incrementFailures();
      persistence.incrementFailures();
      persistence.resetFailures();
      expect(persistence.getKey('consecutiveFailures')).toBe(0);
    });

    it('returns healthy summary when failures low', () => {
      persistence.resetFailures();
      const summary = persistence.getStateSummary();
      expect(summary.isHealthy).toBe(true);
    });

    it('returns unhealthy when failures high', () => {
      persistence.update({ consecutiveFailures: 5 });
      const summary = persistence.getStateSummary();
      expect(summary.isHealthy).toBe(false);
    });
  });
});
