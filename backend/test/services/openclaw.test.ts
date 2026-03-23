import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenClawClient } from '../../src/services/openclaw-client';
import { OpenClawPolicyEnforcer } from '../../src/services/openclaw-policy';

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/config/env', () => ({
  env: {
    OPENCLAW_GATEWAY_URL: 'https://gateway.openclaw.com/api',
    OPENCLAW_API_KEY: undefined,
    MAX_OPENCLAW_EXPOSURE_PERCENT: '20',
    MIN_OPENCLAW_APY: '8.5',
  },
}));

describe('OpenClawClient', () => {
  describe('constructor', () => {
    it('should create client instance', () => {
      const client = new OpenClawClient();
      expect(client).toBeInstanceOf(OpenClawClient);
    });

    it('should accept custom config', () => {
      const client = new OpenClawClient({ gatewayUrl: 'http://custom:9999' });
      expect(client).toBeInstanceOf(OpenClawClient);
    });
  });

  describe('isConnected', () => {
    it('should return false initially', () => {
      const client = new OpenClawClient();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    it('should return false without api key', () => {
      const client = new OpenClawClient();
      expect(client.isAuthenticated()).toBe(false);
    });
  });

  describe('API methods exist', () => {
    const client = new OpenClawClient();

    it('has listAgents', () => expect(typeof client.listAgents).toBe('function'));
    it('has getToolsCatalog', () => expect(typeof client.getToolsCatalog).toBe('function'));
    it('has describeNode', () => expect(typeof client.describeNode).toBe('function'));
    it('has listSessions', () => expect(typeof client.listSessions).toBe('function'));
    it('has getCapabilities', () => expect(typeof client.getCapabilities).toBe('function'));
    it('has invokeTool', () => expect(typeof client.invokeTool).toBe('function'));
    it('has chatCompletions', () => expect(typeof client.chatCompletions).toBe('function'));
  });
});

describe('OpenClawPolicyEnforcer', () => {
  let enforcer: OpenClawPolicyEnforcer;

  beforeEach(() => {
    enforcer = new OpenClawPolicyEnforcer();
  });

  describe('checkTransaction', () => {
    it('allows small transactions', async () => {
      const result = await enforcer.checkTransaction('0x1234', '1000000', '0x');
      expect(result.allowed).toBe(true);
    });

    it('returns allowed when gateway unavailable', async () => {
      const result = await enforcer.checkTransaction('0x1234', '20000000000', '0x');
      expect(result.allowed).toBe(true);
    });
  });

  describe('checkYieldOpportunity', () => {
    it('rejects low APY', async () => {
      const result = await enforcer.checkYieldOpportunity('Risky', 5.0, 'low');
      expect(result.allowed).toBe(false);
    });

    it('allows high APY low risk', async () => {
      const result = await enforcer.checkYieldOpportunity('Safe', 12.0, 'low');
      expect(result.allowed).toBe(true);
    });

    it('requires 1.5x APY for high risk', async () => {
      const result = await enforcer.checkYieldOpportunity('HighRisk', 10.0, 'high');
      expect(result.allowed).toBe(false);
    });
  });
});
