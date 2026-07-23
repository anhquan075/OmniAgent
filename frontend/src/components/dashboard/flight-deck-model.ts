import { chainExplorerUrl } from './chain-proof-link';
import {
  displayReadbackStatus,
  firstCheckBlocker,
  hardBlockersFrom,
  proofCheckStatus,
  type ProofCheckStatus,
} from './proof-blockers';
import { proofLabel, proofText } from './proof-labels';

export type Payload = Record<string, any>;
export type SourceState = 'loading' | 'live' | 'fallback';

export const sourceStateLabel = (sourceState: SourceState): string => {
  if (sourceState === 'live') return 'System operational';
  if (sourceState === 'loading') return 'Loading snapshot';
  return 'Snapshot unavailable';
};

export const sourceMetricLabel = (sourceState: SourceState, liveValue: string): string => {
  if (sourceState === 'live') return liveValue;
  if (sourceState === 'loading') return 'loading';
  return 'unavailable';
};

export type ReceiptRow = {
  decisionId?: string;
  action?: string;
  riskScore?: number;
  timestamp?: string;
  createdAt?: string;
  deployHash?: string;
  proofDigest?: string;
  rationaleHash?: string;
  policyGate?: string;
  eventType?: string;
  hardBlockers?: string[];
};

export type OutcomeSummary = {
  action: string;
  riskScore: string;
  policyGate: string;
  proofStatus: string;
  readback: string;
  evidenceGraph: string;
  paidEvidence: string;
  template: string;
};

export type PolicyRow = {
  key: string;
  label: string;
  status: ProofCheckStatus;
  blocker?: string;
};

const completeStatuses = new Set(['complete', 'approved', 'confirmed', 'verified', 'ready', 'live_verified']);

export const decisionFromBundle = (bundle?: Payload): Payload => (
  bundle?.latestDecision && typeof bundle.latestDecision === 'object' ? bundle.latestDecision : {}
);

export const receiptFromBundle = (bundle?: Payload): Payload => {
  const decision = decisionFromBundle(bundle);
  return bundle?.decisionReceipt ?? decision.decisionReceipt ?? {};
};

export const utcTime = (value?: unknown) => {
  const raw = proofText(value, '');
  if (!raw) return 'pending';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
};

export const shortValue = (value: unknown, fallback = 'pending') => {
  const text = proofText(value, fallback);
  return text.length > 22 ? `${text.slice(0, 10)}...${text.slice(-8)}` : text;
};

export const lifecycleRows = (bundle?: Payload, sourceState: SourceState = 'live') => {
  if (sourceState === 'loading') {
    return ['evidence', 'proposer', 'critic', 'policy_gate', 'casper_submit', 'readback']
      .map((state) => ({ state, status: 'loading', complete: false }));
  }
  if (sourceState !== 'live') {
    return ['evidence', 'proposer', 'critic', 'policy_gate', 'casper_submit', 'readback']
      .map((state) => ({ state, status: 'unavailable', complete: false }));
  }
  const rows = Array.isArray(bundle?.lifecycle) ? bundle.lifecycle : [];
  const fallback = [
    { state: 'evidence', status: 'waiting' },
    { state: 'proposer', status: 'waiting' },
    { state: 'critic', status: 'waiting' },
    { state: 'policy_gate', status: 'blocked' },
    { state: 'casper_submit', status: 'not_submitted' },
    { state: 'readback', status: 'missing' },
  ];
  return (rows.length ? rows : fallback).slice(0, 6).map((item: Payload) => {
    const status = proofText(item.status, 'waiting').toLowerCase();
    return { state: proofText(item.state, 'step'), status, complete: completeStatuses.has(status) };
  });
};

export const policyRows = (bundle?: Payload) => {
  const score = bundle?.proofScore ?? {};
  const checks = score.checks && typeof score.checks === 'object' ? score.checks : {};
  const blockers = hardBlockersFrom(score, bundle?.preflight, bundle?.deployStatus, bundle?.readback);
  return Object.entries(checks).slice(0, 8).map(([key, passed]): PolicyRow => {
    const blocker = firstCheckBlocker(key, blockers);
    return {
      key,
      label: proofLabel(key, { stripCasperPrefix: true }),
      status: proofCheckStatus(key, passed, blockers),
      blocker,
    };
  });
};

export const hasX402Receipt = (x402?: Payload) => {
  const receipt = x402?.receipt;
  return x402?.status === 'verified' && Boolean(receipt && typeof receipt === 'object' && (receipt.receiptHash || receipt.receiptId));
};

export const outcomeSummary = (bundle?: Payload): OutcomeSummary => {
  const decision = decisionFromBundle(bundle);
  const evidenceGraph = decision.evidenceBundle?.evidenceGraph ?? {};
  const x402 = decision.x402 ?? {};
  const blockers = hardBlockersFrom(bundle?.proofScore, bundle?.preflight, bundle?.deployStatus, bundle?.readback);
  return {
    action: proofLabel(decision.action, { stripCasperPrefix: true }),
    riskScore: proofText(decision.riskScore, 'pending'),
    policyGate: proofLabel(decision.policyGate, { stripCasperPrefix: true }),
    proofStatus: proofLabel(bundle?.status, { stripCasperPrefix: true }),
    readback: proofLabel(displayReadbackStatus(bundle?.readback, blockers), { stripCasperPrefix: true }),
    evidenceGraph: proofText(evidenceGraph.graphDigest, 'pending'),
    paidEvidence: hasX402Receipt(x402) ? 'verified' : proofLabel(x402.status, { stripCasperPrefix: true }) || 'unavailable',
    template: proofLabel(decision.policyTemplate?.id, { stripCasperPrefix: true }) || 'rwa collateral v1',
  };
};

export const trustRows = (bundle?: Payload) => {
  const trust = bundle?.trustSummary && typeof bundle.trustSummary === 'object' ? bundle.trustSummary : {};
  return [
    { label: 'Samples', value: proofText(trust.sampleSize, '0') },
    { label: 'Readback', value: formatRate(trust.verifiedReadbackRate) },
    { label: 'Blocked', value: formatRate(trust.policyBlockedRate) },
    { label: 'Paid evidence', value: formatRate(trust.paidEvidenceVerifiedRate) },
  ];
};

export const proofLinks = (runtime?: Payload, bundle?: Payload) => {
  const account = runtime?.account ?? {};
  const deploy = bundle?.deployStatus ?? {};
  const explorerBaseUrl = proofText(account.explorerUrl, 'https://testnet.cspr.live');
  return {
    deploy: chainExplorerUrl({ hash: deploy.deployHash, explorerUrl: deploy.explorerUrl, explorerBaseUrl, kind: 'deploy' }),
    account: proofText(account.accountExplorerUrl, '') || chainExplorerUrl({ hash: account.publicKey, explorerBaseUrl, kind: 'account' }),
    contract: chainExplorerUrl({ hash: account.contract?.hash, explorerBaseUrl, kind: 'contract' }),
    package: chainExplorerUrl({ hash: account.contract?.packageHash, explorerBaseUrl, kind: 'contract-package' }),
    explorerBaseUrl,
  };
};

export const receiptRowTime = (receipt: ReceiptRow) => utcTime(receipt.timestamp ?? receipt.createdAt);

export const receiptRowKey = (receipt: ReceiptRow, fallback = '') => {
  const parts = [
    receipt.createdAt ?? receipt.timestamp,
    receipt.eventType,
    receipt.proofDigest,
    receipt.deployHash,
    receipt.decisionId,
  ].map(value => proofText(value, ''));
  return parts.some(Boolean) ? parts.join('|') : fallback;
};

export const receiptDeployLabel = (receipt: ReceiptRow) => {
  if (receipt.deployHash) return '';
  const hardBlockers = Array.isArray(receipt.hardBlockers) ? receipt.hardBlockers : [];
  if (hardBlockers.some(blocker => blocker.toLowerCase() === 'casper_chain_duplicate_intent')) return 'already recorded';
  const eventType = proofText(receipt.eventType, '').toLowerCase();
  if (eventType.includes('dry_run')) return 'dry run';
  if (eventType.includes('outcome_unknown')) return 'outcome unknown';
  if (eventType.includes('live_submit_failed')) return 'submit failed';
  if (eventType.includes('blocked')) return 'not submitted';
  if (eventType.includes('submitted')) return 'pending';
  return 'not submitted';
};

export type ReceiptProofCategory = 'verified' | 'blocked' | 'other';

export const receiptProofCategory = (receipt: ReceiptRow): ReceiptProofCategory => {
  const eventType = proofText(receipt.eventType, '').toLowerCase();
  if (eventType.includes('readback_verified')) return 'verified';
  if (eventType.includes('blocked') || eventType.includes('failed') || eventType.includes('outcome_unknown')) return 'blocked';
  return 'other';
};

export const selectedReceiptProofState = (receipt?: ReceiptRow, bundle?: Payload) => {
  const latestDecision = decisionFromBundle(bundle);
  const eventType = proofText(receipt?.eventType, '').toLowerCase();
  const latestDeployHash = proofText(bundle?.deployStatus?.deployHash, '');
  const isProofBearingEvent = eventType === 'casper_decision_submitted' || eventType === 'casper_decision_readback_verified';
  const sameDecision = Boolean(receipt?.decisionId && receipt.decisionId === latestDecision.decisionId);
  const sameDeploy = Boolean(receipt?.deployHash && latestDeployHash && receipt.deployHash === latestDeployHash);
  const sameDigest = Boolean(receipt?.proofDigest && receipt.proofDigest === latestDecision.proofDigest);
  const matchesLatest = isProofBearingEvent && sameDecision && sameDeploy && sameDigest;
  return {
    matchesLatest,
    deployStatus: matchesLatest ? bundle?.deployStatus ?? {} : {},
    readback: matchesLatest ? bundle?.readback ?? {} : {},
  };
};

function formatRate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : 'pending';
}
