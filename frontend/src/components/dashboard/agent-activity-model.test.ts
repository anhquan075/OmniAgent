import { describe, expect, it } from 'vitest';

import {
  aiDecisionSummary,
  aiRoleOutputs,
  evidenceSourceUrl,
  mcpActivityRows,
  normalizedLifecycle,
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
});
