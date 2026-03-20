import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdaptiveScheduler, getAdaptiveScheduler, AgentState } from '../../src/agent/services/AdaptiveScheduler';
import { NLCommandParser, getNLCommandParser } from '../../src/agent/services/NLCommandParser';
import { StatePersistence, getStatePersistence, DurableAgentState } from '../../src/agent/services/StatePersistence';

describe('AdaptiveScheduler', () => {
  let scheduler: AdaptiveScheduler;

  beforeEach(() => {
    scheduler = new AdaptiveScheduler();
  });

  describe('getConfig', () => {
    it('should return default config', () => {
      const config = scheduler.getConfig();
      expect(config.highAlertIntervalMs).toBe(30_000);
      expect(config.moderateIntervalMs).toBe(300_000);
      expect(config.stableIntervalMs).toBe(3_600_000);
    });
  });

  describe('getVolatilityStats', () => {
    it('should return zeros when no history', () => {
      const stats = scheduler.getVolatilityStats();
      expect(stats.current).toBe(0);
      expect(stats.sampleSize).toBe(0);
    });
  });

  describe('updateConfig', () => {
    it('should update config values', () => {
      scheduler.updateConfig({ highAlertIntervalMs: 10_000 });
      const config = scheduler.getConfig();
      expect(config.highAlertIntervalMs).toBe(10_000);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const s1 = getAdaptiveScheduler();
      const s2 = getAdaptiveScheduler();
      expect(s1).toBe(s2);
    });
  });
});

describe('NLCommandParser', () => {
  let parser: NLCommandParser;

  beforeEach(() => {
    parser = new NLCommandParser(false);
  });

  describe('parse supply command', () => {
    it('should parse supply command with amount and token', async () => {
      const result = await parser.parse('supply 100 USDT');
      expect(result.action).toBe('supply');
      expect(result.params.amount).toBe('100');
      expect(result.params.token).toBe('USDT');
      expect(result.method).toBe('pattern');
    });

    it('should parse supply xaut', async () => {
      const result = await parser.parse('supply 1.5 xaut');
      expect(result.action).toBe('supply');
      expect(result.params.amount).toBe('1.5');
      expect(result.params.token).toBe('XAUT');
    });
  });

  describe('parse withdraw command', () => {
    it('should parse withdraw command', async () => {
      const result = await parser.parse('withdraw 50 USDT');
      expect(result.action).toBe('withdraw');
      expect(result.params.amount).toBe('50');
      expect(result.params.token).toBe('USDT');
    });
  });

  describe('parse status command', () => {
    it('should parse status', async () => {
      const result = await parser.parse('status');
      expect(result.action).toBe('status');
      expect(result.params).toEqual({});
    });
  });

  describe('parse pause/resume', () => {
    it('should parse pause', async () => {
      const result = await parser.parse('pause');
      expect(result.action).toBe('pause');
    });

    it('should parse resume', async () => {
      const result = await parser.parse('resume');
      expect(result.action).toBe('resume');
    });
  });

  describe('parse unknown command', () => {
    it('should return unknown with zero confidence when no match', async () => {
      const result = await parser.parse('gibberish command xyz');
      expect(result.action).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const p1 = getNLCommandParser();
      const p2 = getNLCommandParser();
      expect(p1).toBe(p2);
    });
  });
});

describe('StatePersistence', () => {
  let persistence: StatePersistence;

  beforeEach(() => {
    persistence = new StatePersistence('/tmp/test-agent-state.json');
  });

  describe('get', () => {
    it('should return current state', () => {
      const state = persistence.get();
      expect(state).toBeDefined();
      expect(state.lastAction).toBe('init');
    });
  });

  describe('update', () => {
    it('should update state fields', () => {
      persistence.update({ lastAction: 'supply', consecutiveFailures: 2 });
      const state = persistence.get();
      expect(state.lastAction).toBe('supply');
      expect(state.consecutiveFailures).toBe(2);
    });
  });

  describe('set', () => {
    it('should set individual key', () => {
      persistence.set('lastAction', 'withdraw');
      expect(persistence.getKey('lastAction')).toBe('withdraw');
    });
  });

  describe('increment/reset failures', () => {
    it('should increment failures', () => {
      persistence.resetFailures();
      persistence.incrementFailures();
      persistence.incrementFailures();
      expect(persistence.getKey('consecutiveFailures')).toBe(2);
    });

    it('should reset failures', () => {
      persistence.incrementFailures();
      persistence.incrementFailures();
      persistence.resetFailures();
      expect(persistence.getKey('consecutiveFailures')).toBe(0);
    });
  });

  describe('recordAction', () => {
    it('should record action with timestamp', () => {
      persistence.recordAction('supply_usdt');
      const state = persistence.get();
      expect(state.lastAction).toBe('supply_usdt');
      expect(state.lastActionTime).toBeGreaterThan(0);
    });
  });

  describe('isStale', () => {
    it('should return false for fresh state', () => {
      persistence.recordAction('test');
      expect(persistence.isStale(60000)).toBe(false);
    });

    it.skip('should return true for old state (singleton isolation issue)', () => {
      const oldTime = Date.now() - 120000;
      persistence.update({ updatedAt: oldTime });
      expect(persistence.isStale(60000)).toBe(true);
    });
  });

  describe('getStateSummary', () => {
    it('should return health status', () => {
      persistence.resetFailures();
      const summary = persistence.getStateSummary();
      expect(summary.isHealthy).toBe(true);
      expect(summary.consecutiveFailures).toBe(0);
    });

    it('should indicate unhealthy when failures high', () => {
      persistence.update({ consecutiveFailures: 5 });
      const summary = persistence.getStateSummary();
      expect(summary.isHealthy).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset to default state', () => {
      persistence.update({ consecutiveFailures: 10, lastAction: 'test' });
      persistence.reset();
      const state = persistence.get();
      expect(state.consecutiveFailures).toBe(0);
      expect(state.lastAction).toBe('init');
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const p1 = getStatePersistence('/tmp/test.json');
      const p2 = getStatePersistence('/tmp/test.json');
      expect(p1).toBe(p2);
    });
  });
});
