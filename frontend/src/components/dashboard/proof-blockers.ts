import { proofText } from './proof-labels';

export type Payload = Record<string, any>;

export type ProofCheckStatus = 'pass' | 'blocked' | 'fail';

const deployBlockers = [
  'casper_account_missing',
  'casper_secret_key_path_missing',
  'casper_secret_key_unreadable',
  'casper_secret_key_in_repo',
  'casper_decision_contract_hash_missing',
  'casper_decision_contract_package_hash_missing',
  'casper_live_submit_disabled',
  'casper_client_missing',
  'casper_rpc_unreachable',
  'casper_account_balance_insufficient',
  'casper_transaction_wasm_path_missing',
  'casper_transaction_wasm_unreadable',
  'casper_deploy_hash_missing',
  'casper_deploy_not_confirmed',
];

const checkBlockers: Record<string, string[]> = {
  casperAccountConfigured: ['casper_account_missing'],
  casperRpcReachable: ['casper_rpc_unreachable', 'casper_cspr_cloud_unreachable'],
  casperContractConfigured: [
    'casper_decision_contract_hash_missing',
    'casper_decision_contract_package_hash_missing',
  ],
  casperDeployConfirmed: deployBlockers,
  readbackMatchesDigest: [
    ...deployBlockers,
    'casper_readback_missing',
    'casper_readback_digest_mismatch',
    'casper_decision_receipt_readback_missing',
    'casper_decision_receipt_mismatch',
  ],
  policyGateApproved: ['casper_policy_gate_blocked'],
  evidenceSourceHashPresent: ['rwa_evidence_missing', 'rwa_evidence_stale'],
  evidenceGraphDigestPresent: ['rwa_evidence_missing', 'rwa_evidence_stale'],
  x402PaidEvidenceVerified: [
    'x402_evidence_endpoint_missing',
    'x402_receipt_missing',
    'x402_receipt_unbound',
    'x402_receipt_invalid',
  ],
};

const hardReadbackFailures = new Set([
  'casper_readback_digest_mismatch',
  'casper_decision_receipt_mismatch',
]);

export const hardBlockersFrom = (...sources: unknown[]): string[] => {
  const blockers = sources.flatMap(source => {
    if (!source || typeof source !== 'object') return [];
    const hardBlockers = (source as Payload).hardBlockers;
    return Array.isArray(hardBlockers) ? hardBlockers.filter(item => typeof item === 'string') : [];
  });
  return Array.from(new Set(blockers));
};

export const firstCheckBlocker = (key: string, blockers: string[]) => {
  const relevant = checkBlockers[key] ?? [];
  return blockers.find(blocker => relevant.includes(blocker));
};

export const proofCheckStatus = (key: string, passed: unknown, blockers: string[]): ProofCheckStatus => {
  if (passed) return 'pass';
  const blocker = firstCheckBlocker(key, blockers);
  if (!blocker) return 'fail';
  if (key === 'readbackMatchesDigest' && hardReadbackFailures.has(blocker)) return 'fail';
  return 'blocked';
};

export const displayDeployStatus = (deploy: Payload = {}, blockers: string[] = []) => {
  const status = proofText(deploy.status, '');
  if (status && !['missing', 'not_submitted', 'unverified', 'pending'].includes(status)) return status;
  return firstCheckBlocker('casperDeployConfirmed', blockers) ? 'blocked' : proofText(deploy.status);
};

export const displayReadbackStatus = (readback: Payload = {}, blockers: string[] = []) => {
  if (readback.verified === true) return 'verified';
  const status = proofText(readback.status, '');
  if (
    status
    && !['missing', 'pending'].includes(status)
    && !firstCheckBlocker('readbackMatchesDigest', blockers)
  ) {
    return status;
  }
  return firstCheckBlocker('readbackMatchesDigest', blockers) ? 'blocked' : proofText(readback.status);
};
