import { proofLabel, proofText } from './proof-labels';

export type Payload = Record<string, any>;

export type McpActivityRow = {
  tool: string;
  status: string;
  output: string;
};

export type AiRoleOutput = {
  role: string;
  verdict: string;
  confidence: string;
  summary: string;
};

const DEFAULT_TOOLS = [
  'casper_rwa_evidence',
  'casper_guardrails',
  'casper_live_preflight',
  'casper_record_decision',
  'casper_record_readback',
];

const completeStatuses = new Set(['complete', 'approved', 'confirmed', 'verified', 'ready']);

export const decisionFromBundle = (bundle?: Payload): Payload => (
  bundle?.latestDecision && typeof bundle.latestDecision === 'object' ? bundle.latestDecision : {}
);

export const normalizedLifecycle = (bundle?: Payload) => {
  const lifecycle = Array.isArray(bundle?.lifecycle) ? bundle.lifecycle : [];
  const rows = lifecycle.length ? lifecycle : [
    { state: 'sense', status: 'waiting' },
    { state: 'propose', status: 'waiting' },
    { state: 'critique', status: 'waiting' },
    { state: 'policy_gate', status: 'blocked' },
    { state: 'submit', status: 'not_submitted' },
    { state: 'readback', status: 'missing' },
  ];
  return rows.slice(0, 6).map((item: Payload) => ({
    state: proofText(item.state, 'step'),
    status: proofText(item.status, 'waiting'),
    complete: completeStatuses.has(proofText(item.status, '').toLowerCase()),
  }));
};

export const mcpActivityRows = (runtime?: Payload, bundle?: Payload): McpActivityRow[] => {
  const decision = decisionFromBundle(bundle);
  const cycleTools = [
    ...arrayOfStrings(decision.cycle?.toolsUsed),
    ...arrayOfStrings(bundle?.cycle?.toolsUsed),
    ...arrayOfStrings(runtime?.cycle?.toolsUsed),
  ];
  const tools = cycleTools.length ? Array.from(new Set(cycleTools)) : DEFAULT_TOOLS;
  return withRequiredTool(tools, 'casper_record_readback', 6)
    .map(tool => activityForTool(tool, runtime, bundle, decision));
};

export const aiDecisionSummary = (bundle?: Payload) => {
  const decision = decisionFromBundle(bundle);
  return {
    action: proofLabel(decision.action, { stripCasperPrefix: true }),
    riskScore: proofText(decision.riskScore, 'pending'),
    policyGate: proofLabel(decision.policyGate, { stripCasperPrefix: true }),
    rationale: shortText(decision.rationale, 168),
    proofDigest: proofText(decision.proofDigest),
    rationaleHash: proofText(decision.rationaleHash),
    sourceHash: proofText(decision.evidenceBundle?.sourceHash ?? decision.sourceHash),
    guardrailHash: proofText(decision.guardrailHash ?? decision.guardrails?.guardrailHash),
  };
};

export const aiRoleOutputs = (bundle?: Payload): AiRoleOutput[] => {
  const decision = decisionFromBundle(bundle);
  const roles = Array.isArray(decision.guardrails?.roles) ? decision.guardrails.roles : [];
  if (!roles.length) {
    return [{
      role: 'policy_gate',
      verdict: proofLabel(decision.policyGate, { stripCasperPrefix: true }),
      confidence: proofText(decision.materialityGate?.confidence),
      summary: proofText(decision.rationale, 'waiting for autonomous cycle output'),
    }];
  }
  return roles.slice(0, 3).map((role: Payload) => ({
    role: proofLabel(role.agentRole, { stripCasperPrefix: true }),
    verdict: proofLabel(role.verdict, { stripCasperPrefix: true }),
    confidence: formatConfidence(role.confidence),
    summary: arrayOfStrings(role.reasonCodes).slice(0, 3).map(item => proofLabel(item)).join(' · ') || 'ready',
  }));
};

export const evidenceSourceUrl = (bundle?: Payload) => {
  const decision = decisionFromBundle(bundle);
  const sources = Array.isArray(decision.evidenceBundle?.sources) ? decision.evidenceBundle.sources : [];
  const source = sources.find((item: Payload) => typeof item?.url === 'string' && item.url);
  return safeHttpsUrl(source?.url);
};

export const safeHttpsUrl = (value: unknown) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
};

function activityForTool(tool: string, runtime?: Payload, bundle?: Payload, decision: Payload = {}): McpActivityRow {
  const evidence = decision.evidenceBundle && typeof decision.evidenceBundle === 'object' ? decision.evidenceBundle : {};
  const guardrails = decision.guardrails && typeof decision.guardrails === 'object' ? decision.guardrails : {};
  const preflight = bundle?.preflight ?? runtime?.preflight ?? {};
  const deploy = bundle?.deployStatus ?? decision.deployStatus ?? {};
  const readback = bundle?.readback ?? decision.readback ?? {};
  const outputByTool: Record<string, Payload> = {
    casper_rwa_evidence: {
      scenario: proofText(evidence.scenario, 'rwa-collateral-risk-sentinel'),
      status: proofText(evidence.status, decision.sourceHash ? 'ready' : 'waiting'),
      riskScore: proofText(evidence.riskScore ?? decision.riskScore),
      sourceHash: proofText(evidence.sourceHash ?? decision.sourceHash),
      sources: Array.isArray(evidence.sources) ? evidence.sources.length : 0,
    },
    casper_guardrails: {
      status: proofText(guardrails.status ?? decision.policyGate),
      guardrailHash: proofText(guardrails.guardrailHash ?? decision.guardrailHash),
      roles: Array.isArray(guardrails.roles) ? guardrails.roles.length : 0,
    },
    casper_live_preflight: {
      status: proofText(preflight.status ?? runtime?.status),
      liveSubmitEnabled: Boolean(preflight.liveSubmitEnabled),
      blockers: Array.isArray(preflight.hardBlockers) ? preflight.hardBlockers.length : 0,
    },
    casper_record_decision: {
      decisionId: proofText(decision.decisionId),
      status: proofText(deploy.status ?? bundle?.status),
      deployHash: proofText(deploy.deployHash ?? decision.deployHash),
      proofDigest: proofText(decision.proofDigest),
    },
    casper_record_readback: {
      status: proofText(readback.status),
      verified: Boolean(readback.verified),
      expectedProofDigest: proofText(readback.expectedProofDigest ?? decision.proofDigest),
      observedProofDigest: proofText(readback.observedProofDigest ?? readback.proofDigest),
    },
  };
  const output = outputByTool[tool] ?? { status: proofText(bundle?.status ?? runtime?.status), tool };
  return { tool, status: proofText(output.status), output: JSON.stringify(output) };
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function withRequiredTool(tools: string[], required: string, limit: number) {
  const unique = Array.from(new Set(tools));
  if (unique.includes(required)) return unique.slice(0, limit);
  return [...unique.slice(0, Math.max(0, limit - 1)), required];
}

function shortText(value: unknown, limit: number) {
  const text = proofText(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function formatConfidence(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : proofText(value);
}
