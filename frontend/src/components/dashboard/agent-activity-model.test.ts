import { describe, expect, it } from 'vitest';

import {
  aiDecisionSummary,
  aiRoleOutputs,
  evidenceSourceUrl,
  mcpActivityRows,
  normalizedLifecycle,
  streamPanelStatus,
} from './agent-activity-model';

const bundle = {
  status: 'live_verified',
  latestDecision: {
    action: 'warn',
    riskScore: 72,
    rationale: 'Treasury collateral yield crossed the policy band.',
    policyGate: 'approved',
    proofDigest: 'sha256:proof',
    rationaleHash: 'sha256:rationale',
    guardrailHash: 'sha256:guard',
    evidenceBundle: {
      status: 'ready',
      sourceHash: 'sha256:source',
      riskScore: 72,
      sources: [{ url: 'https://example.invalid/evidence' }],
    },
    guardrails: {
      status: 'approved',
      guardrailHash: 'sha256:guard',
      roles: [
        { agentRole: 'proposer', verdict: 'proposed', confidence: 0.86, reasonCodes: ['risk_score_72'] },
        { agentRole: 'policy_gate', verdict: 'approved', confidence: 0.94, reasonCodes: ['policy_approved'], traceSource: 'llm', outputHash: 'sha256:trace' },
      ],
    },
  },
  lifecycle: [{ state: 'readback', status: 'verified' }],
  preflight: { status: 'ready', liveSubmitEnabled: true, hardBlockers: [] },
  deployStatus: { status: 'confirmed', deployHash: 'deploy-hash' },
  readback: { status: 'verified', verified: true, observedProofDigest: 'sha256:proof' },
};

describe('agent activity model', () => {
  it('builds bounded MCP rows from Casper proof data', () => {
    const rows = mcpActivityRows({ status: 'ready' }, bundle);

    expect(rows.map(row => row.tool)).toEqual([
      'casper_rwa_evidence',
      'casper_guardrails',
      'casper_live_preflight',
      'casper_record_decision',
      'casper_record_readback',
    ]);
    expect(rows.find(row => row.tool === 'casper_rwa_evidence')?.output).toContain('sha256:source');
    expect(rows.find(row => row.tool === 'casper_record_readback')?.status).toBe('verified');
  });

  it('summarizes AI output and lifecycle roles for the dashboard', () => {
    expect(aiDecisionSummary(bundle)).toMatchObject({
      action: 'warn',
      riskScore: '72',
      policyGate: 'approved',
      proofDigest: 'sha256:proof',
    });
    expect(aiRoleOutputs(bundle).map(role => role.role)).toEqual(['proposer', 'policy gate']);
    expect(aiRoleOutputs(bundle)[1]).toMatchObject({ traceSource: 'llm', traceHash: 'sha256:trace' });
    expect(normalizedLifecycle(bundle)).toEqual([{ state: 'readback', status: 'verified', complete: true }]);
  });

  it('keeps the readback row when tool output exceeds the visible log limit', () => {
    const rows = mcpActivityRows({
      cycle: { toolsUsed: ['tool_a', 'tool_b', 'tool_c', 'tool_d', 'tool_e', 'tool_f'] },
    }, bundle);

    expect(rows).toHaveLength(6);
    expect(rows.map(row => row.tool)).toContain('casper_record_readback');
  });

  it('uses recorded tool activity verbatim without inventing a readback call', () => {
    const rows = mcpActivityRows({}, {
      cycle: {
        toolsUsed: ['casper_rwa_evidence', 'casper_record_readback'],
        toolActivity: [
          {
            callId: 'cycle-a:evidence',
            tool: 'casper_rwa_evidence',
            status: 'complete',
            invoked: true,
            output: { marker: 'cycle-a-output' },
          },
          {
            callId: 'cycle-a:decision',
            tool: 'casper_record_decision',
            status: 'complete',
            invoked: false,
            output: { reason: 'policy_blocked' },
          },
        ],
      },
    });

    expect(rows).toEqual([
      {
        callId: 'cycle-a:evidence',
        tool: 'casper_rwa_evidence',
        status: 'complete',
        output: '{"marker":"cycle-a-output"}',
      },
      {
        callId: 'cycle-a:decision',
        tool: 'casper_record_decision',
        status: 'skipped',
        output: '{"reason":"policy_blocked"}',
      },
    ]);
    expect(rows.map(row => row.tool)).not.toContain('casper_record_readback');
  });

  it('shows funded-account blockers in deploy and readback log rows', () => {
    const blockedBundle = {
      latestDecision: {
        decisionId: 'blocked-001',
        proofDigest: 'sha256:proof',
      },
      preflight: {
        status: 'blocked',
        liveSubmitEnabled: false,
        hardBlockers: ['casper_account_balance_insufficient'],
        accountBalance: { status: 'ready', source: 'casper_client_query_balance', motes: 0, cspr: 0 },
      },
      deployStatus: { status: 'not_submitted', hardBlockers: ['casper_deploy_hash_missing'] },
      readback: { status: 'missing', verified: false, hardBlockers: ['casper_readback_missing'] },
      proofScore: {
        hardBlocked: true,
        hardBlockers: [
          'casper_account_balance_insufficient',
          'casper_deploy_hash_missing',
          'casper_readback_missing',
        ],
      },
    };

    const rows = mcpActivityRows({ status: 'blocked' }, blockedBundle);
    const preflight = rows.find(row => row.tool === 'casper_live_preflight');
    const decision = rows.find(row => row.tool === 'casper_record_decision');
    const readback = rows.find(row => row.tool === 'casper_record_readback');

    expect(preflight?.output).toContain('"motes":0');
    expect(decision).toMatchObject({ status: 'blocked' });
    expect(decision?.output).toContain('casper_account_balance_insufficient');
    expect(readback).toMatchObject({ status: 'blocked' });
    expect(readback?.output).toContain('casper_readback_missing');
  });

  it('labels fallback role output as deterministic', () => {
    const roles = aiRoleOutputs({ latestDecision: { policyGate: 'blocked', proofDigest: 'sha256:fallback' } });

    expect(roles[0]).toMatchObject({
      role: 'policy gate',
      traceSource: 'deterministic',
      traceHash: 'sha256:fallback',
    });
  });

  it('only exposes https evidence links', () => {
    const withUrl = (url: string) => ({
      latestDecision: { evidenceBundle: { sources: [{ url }] } },
    });

    expect(evidenceSourceUrl(withUrl('https://example.invalid/evidence'))).toBe('https://example.invalid/evidence');
    expect(evidenceSourceUrl(withUrl('javascript:alert(1)'))).toBe('');
    expect(evidenceSourceUrl(withUrl('data:text/html,proof'))).toBe('');
    expect(evidenceSourceUrl(withUrl('http://example.invalid/evidence'))).toBe('');
  });

  it('formats SSE stream metadata for live MCP and AI panels', () => {
    expect(streamPanelStatus({
      transport: 'sse',
      sequence: 42,
      emittedAt: '2026-07-04T08:31:09.000Z',
      intervalSec: 1,
    }, Date.parse('2026-07-04T08:31:10.000Z'))).toMatchObject({
      label: 'live',
      sequence: '#42',
      emittedAt: '08:31:09 UTC',
      isLive: true,
    });
    expect(streamPanelStatus({
      transport: 'sse',
      sequence: 42,
      emittedAt: '2026-07-04T08:31:09.000Z',
      intervalSec: 1,
    }, Date.parse('2026-07-04T08:31:20.000Z'))).toMatchObject({
      label: 'stale',
      sequence: '#42',
      isLive: false,
    });
    expect(streamPanelStatus()).toMatchObject({
      label: 'snapshot',
      sequence: 'pending',
      emittedAt: 'pending',
      isLive: false,
    });
    expect(streamPanelStatus({
      transport: 'history',
      sequence: '#loop-cycle-001',
      emittedAt: '2026-07-04T08:00:00.000Z',
    })).toMatchObject({
      label: 'recorded',
      sequence: '#loop-cycle-001',
      emittedAt: '08:00:00 UTC',
      isLive: false,
      isHistory: true,
    });
  });
});
