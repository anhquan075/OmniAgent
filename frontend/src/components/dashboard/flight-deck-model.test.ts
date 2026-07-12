import { describe, expect, it } from 'vitest';

import {
  hasX402Receipt,
  lifecycleRows,
  outcomeSummary,
  policyRows,
  proofLinks,
  receiptDeployLabel,
  receiptProofCategory,
  receiptRowKey,
  selectedReceiptProofState,
  trustRows,
  utcTime,
} from './flight-deck-model';

const bundle = {
  lifecycle: [
    { state: 'evidence', status: 'complete' },
    { state: 'policy_gate', status: 'blocked' },
  ],
  latestDecision: { decisionId: 'latest-001', proofDigest: 'sha256:latest-proof' },
  deployStatus: { deployHash: 'deploy-hash', explorerUrl: 'https://testnet.cspr.live/deploy/deploy-hash' },
  readback: { verified: true, status: 'verified' },
};

describe('flight deck model', () => {
  it('quarantines lifecycle rows when source state is not live', () => {
    const rows = lifecycleRows(bundle, 'fallback');

    expect(rows).toHaveLength(6);
    expect(rows.every(row => row.status === 'unavailable')).toBe(true);
    expect(rows.some(row => row.complete)).toBe(false);
  });

  it('marks only concrete completion states as complete for live lifecycle rows', () => {
    expect(lifecycleRows(bundle, 'live')).toEqual([
      { state: 'evidence', status: 'complete', complete: true },
      { state: 'policy_gate', status: 'blocked', complete: false },
    ]);
  });

  it('requires verified public x402 receipt metadata for verified state', () => {
    expect(hasX402Receipt({ status: 'ready', endpoint: 'https://example.invalid/x402' })).toBe(false);
    expect(hasX402Receipt({ status: 'configured', receipt: { receiptId: 'paid-1' } })).toBe(false);
    expect(hasX402Receipt({ status: 'verified', receipt: { receiptId: 'paid-1' } })).toBe(true);
    expect(hasX402Receipt({ status: 'verified', receipt: { receiptHash: 'sha256:abc' } })).toBe(true);
  });

  it('attaches latest deploy and readback only to the matching receipt', () => {
    expect(selectedReceiptProofState({
      decisionId: 'latest-001',
      deployHash: 'deploy-hash',
      proofDigest: 'sha256:latest-proof',
      eventType: 'casper_decision_readback_verified',
    }, bundle)).toMatchObject({
      matchesLatest: true,
      deployStatus: bundle.deployStatus,
      readback: bundle.readback,
    });
    expect(selectedReceiptProofState({
      decisionId: 'latest-001',
      proofDigest: 'sha256:latest-proof',
      eventType: 'casper_decision_live_submit_blocked',
    }, bundle)).toMatchObject({
      matchesLatest: false,
      deployStatus: {},
      readback: {},
    });
    expect(selectedReceiptProofState({
      decisionId: 'latest-001',
      deployHash: 'deploy-hash',
      proofDigest: 'sha256:mismatched-proof',
      eventType: 'casper_decision_readback_verified',
    }, bundle)).toMatchObject({
      matchesLatest: false,
      deployStatus: {},
      readback: {},
    });
    expect(selectedReceiptProofState({ decisionId: 'older-001' }, bundle)).toMatchObject({
      matchesLatest: false,
      deployStatus: {},
      readback: {},
    });
  });

  it('maps missing deploy hashes to the recorded submission outcome', () => {
    expect(receiptDeployLabel({
      eventType: 'casper_decision_live_submit_blocked',
      hardBlockers: ['casper_chain_duplicate_intent'],
    })).toBe('already recorded');
    for (const blocker of [
      'casper_submission_duplicate_intent',
      'casper_chain_semantic_id_collision',
      'casper_chain_submission_cooldown_active',
    ]) {
      expect(receiptDeployLabel({
        eventType: 'casper_decision_live_submit_blocked',
        hardBlockers: [blocker],
      })).toBe('not submitted');
    }
    expect(receiptDeployLabel({ eventType: 'casper_decision_live_submit_blocked' })).toBe('not submitted');
    expect(receiptDeployLabel({ eventType: 'casper_decision_dry_run' })).toBe('dry run');
    expect(receiptDeployLabel({ eventType: 'casper_decision_live_submit_failed' })).toBe('submit failed');
    expect(receiptDeployLabel({ eventType: 'casper_decision_submission_outcome_unknown' })).toBe('outcome unknown');
    expect(receiptDeployLabel({ eventType: 'casper_decision_submitted' })).toBe('pending');
    expect(receiptDeployLabel({ eventType: 'casper_decision_live_submit_blocked', deployHash: 'deploy-hash' })).toBe('');
  });

  it('classifies filters from proof events instead of treating every non-blocked row as verified', () => {
    expect(receiptProofCategory({ eventType: 'casper_decision_readback_verified' })).toBe('verified');
    expect(receiptProofCategory({ eventType: 'casper_decision_live_submit_blocked' })).toBe('blocked');
    expect(receiptProofCategory({ eventType: 'casper_decision_live_submit_failed' })).toBe('blocked');
    expect(receiptProofCategory({ eventType: 'casper_decision_submitted' })).toBe('other');
  });

  it('keeps repeated decision IDs as distinct receipt rows', () => {
    const verifiedKey = receiptRowKey({
      decisionId: 'latest-001',
      createdAt: '2026-07-11T01:00:00Z',
      eventType: 'casper_decision_readback_verified',
      proofDigest: 'sha256:latest-proof',
    });
    const blockedKey = receiptRowKey({
      decisionId: 'latest-001',
      createdAt: '2026-07-11T01:30:00Z',
      eventType: 'casper_decision_live_submit_blocked',
      proofDigest: 'sha256:newer-blocked-attempt',
    });

    expect(blockedKey).not.toBe(verifiedKey);
  });

  it('formats UTC timestamps and Casper explorer links', () => {
    expect(utcTime('2026-07-03T10:41:12Z')).toBe('2026-07-03 10:41:12 UTC');
    expect(proofLinks({
      account: {
        explorerUrl: 'https://testnet.cspr.live',
        publicKey: 'account-key',
        contract: { hash: 'contract-hash', packageHash: 'package-hash' },
      },
    }, bundle)).toMatchObject({
      deploy: 'https://testnet.cspr.live/deploy/deploy-hash',
      account: 'https://testnet.cspr.live/account/account-key',
      contract: 'https://testnet.cspr.live/contract/contract-hash',
      package: 'https://testnet.cspr.live/contract-package/package-hash',
    });
  });

  it('summarizes cockpit outcome and trust metrics', () => {
    expect(outcomeSummary({
      status: 'live_verified',
      readback: { verified: true },
      latestDecision: {
        action: 'approve',
        riskScore: 22,
        policyGate: 'approved',
        policyTemplate: { id: 'rwa-collateral-v1' },
        evidenceBundle: { evidenceGraph: { graphDigest: 'sha256:graph' } },
        x402: { status: 'verified', receipt: { receiptHash: 'sha256:x402' } },
      },
    })).toMatchObject({
      action: 'approve',
      riskScore: '22',
      policyGate: 'approved',
      readback: 'verified',
      paidEvidence: 'verified',
    });
    expect(trustRows({ trustSummary: { sampleSize: 3, verifiedReadbackRate: 0.667 } })[1].value).toBe('67%');
  });

  it('marks downstream Casper proof checks as blocked when the account is unfunded', () => {
    const rows = policyRows({
      status: 'blocked',
      preflight: {
        status: 'blocked',
        hardBlockers: ['casper_account_balance_insufficient'],
        accountBalance: { motes: 0, cspr: 0 },
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
        checks: {
          casperDeployConfirmed: false,
          readbackMatchesDigest: false,
          decisionPayloadValid: true,
        },
      },
    });

    expect(rows.find(row => row.key === 'casperDeployConfirmed')).toMatchObject({
      status: 'blocked',
      blocker: 'casper_account_balance_insufficient',
    });
    expect(rows.find(row => row.key === 'readbackMatchesDigest')).toMatchObject({
      status: 'blocked',
      blocker: 'casper_account_balance_insufficient',
    });
    expect(rows.find(row => row.key === 'decisionPayloadValid')?.status).toBe('pass');
  });

  it('summarizes readback as blocked while live submit is blocked upstream', () => {
    expect(outcomeSummary({
      status: 'blocked',
      preflight: { hardBlockers: ['casper_account_balance_insufficient'] },
      readback: { status: 'missing', verified: false, hardBlockers: ['casper_readback_missing'] },
      proofScore: {
        hardBlockers: ['casper_account_balance_insufficient', 'casper_readback_missing'],
      },
      latestDecision: {
        action: 'approve',
        riskScore: 22,
        policyGate: 'approved',
      },
    }).readback).toBe('blocked');
  });
});
