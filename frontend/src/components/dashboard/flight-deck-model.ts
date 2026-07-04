import { chainExplorerUrl } from './chain-proof-link';
import { proofLabel, proofText } from './proof-labels';

export type Payload = Record<string, any>;
export type SourceState = 'loading' | 'live' | 'fallback';

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
  return Object.entries(checks).slice(0, 8).map(([key, passed]) => ({
    key,
    label: proofLabel(key, { stripCasperPrefix: true }),
    status: passed ? 'pass' : 'fail',
  }));
};

export const hasX402Receipt = (x402?: Payload) => {
  const receipt = x402?.receipt;
  return x402?.status === 'verified' && Boolean(receipt && typeof receipt === 'object' && (receipt.receiptHash || receipt.receiptId));
};

export const outcomeSummary = (bundle?: Payload): OutcomeSummary => {
  const decision = decisionFromBundle(bundle);
  const evidenceGraph = decision.evidenceBundle?.evidenceGraph ?? {};
  const x402 = decision.x402 ?? {};
  return {
    action: proofLabel(decision.action, { stripCasperPrefix: true }),
    riskScore: proofText(decision.riskScore, 'pending'),
    policyGate: proofLabel(decision.policyGate, { stripCasperPrefix: true }),
    proofStatus: proofLabel(bundle?.status, { stripCasperPrefix: true }),
    readback: bundle?.readback?.verified ? 'verified' : proofLabel(bundle?.readback?.status, { stripCasperPrefix: true }),
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

export const selectedReceiptProofState = (receipt?: ReceiptRow, bundle?: Payload) => {
  const latestDecision = decisionFromBundle(bundle);
  const matchesLatest = Boolean(receipt?.decisionId && receipt.decisionId === latestDecision.decisionId);
  return {
    matchesLatest,
    deployStatus: matchesLatest ? bundle?.deployStatus ?? {} : {},
    readback: matchesLatest ? bundle?.readback ?? {} : {},
  };
};

function formatRate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : 'pending';
}
