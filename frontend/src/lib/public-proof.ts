export type VaultStateDelta = {
  entryPoint: string | null;
  fromDecision: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  summary: string;
};

export type VaultRecentAction = {
  entryPoint: string | null;
  status: string | null;
  decisionId: string | null;
  transactionHash: string | null;
  explorerUrl: string | null;
  assetId: string | null;
};

export type PublicProofVault = {
  enforceEnabled: boolean;
  verificationMode?: 'cross_contract' | 'legacy_receipt';
  proofContractHash?: string | null;
  configured: boolean;
  contractHash: string | null;
  packageHash: string | null;
  assetId: string | null;
  lastAction: string | null;
  lastStatus: string | null;
  decisionId: string | null;
  transactionHash: string | null;
  explorerUrl: string | null;
  contractLinks?: Record<string, string>;
  actionMap: Record<string, string>;
  recentActions?: VaultRecentAction[];
  stateDelta?: VaultStateDelta;
};

export type CheatScenario = {
  id: string;
  title: string;
  expectedUserError: number;
  entryPoint: string;
  errorLabel: string;
  explanation: string;
  attack: string;
  expectedOutcome: string;
  status: string;
  transactionHash: string | null;
  explorerUrl: string | null;
  errorMessage?: string | null;
  recordedAt?: string | null;
  liveEnabled?: boolean;
};

export type CheatReverts = {
  status: string;
  count: number;
  readyCount: number;
  liveEnabled: boolean;
  tryPath: string;
  endpoint: string;
  scenarios: CheatScenario[];
};

export type CheatRunResult = {
  ok: boolean;
  status: string;
  mode?: string;
  scenarioId?: string;
  title?: string;
  expectedUserError?: number;
  observedUserError?: number;
  errorLabel?: string;
  errorMessage?: string | null;
  explanation?: string;
  attack?: string;
  expectedOutcome?: string;
  transactionHash?: string | null;
  explorerUrl?: string | null;
  recordedAt?: string | null;
  hardBlockers?: string[];
  hint?: string;
  retryAfterSec?: number;
};

export type PaidActStep = {
  id: string;
  title: string;
  order: number;
  explanation: string;
  actionLabel: string;
  expectedOutcome: string;
  status: string;
  settlementTxHash?: string | null;
  explorerUrl?: string | null;
  endpoint?: string;
};

export type PaidAct = {
  status: string;
  count: number;
  readyCount: number;
  tryPath: string;
  endpoint: string;
  evidenceEndpoint?: string;
  x402Status?: string | null;
  bindingStatus?: string | null;
  settlementTxHash?: string | null;
  explorerUrl?: string | null;
  steps: PaidActStep[];
};

export type PaidActRunResult = {
  ok: boolean;
  status: string;
  mode?: string;
  stepId?: string;
  title?: string;
  explanation?: string;
  expectedOutcome?: string;
  httpStatus?: number;
  paymentNetwork?: string | null;
  amount?: string | null;
  currency?: string | null;
  unlocked?: boolean;
  x402Status?: string | null;
  bindingStatus?: string | null;
  settlementTxHash?: string | null;
  explorerUrl?: string | null;
  decisionId?: string | null;
  decisionAction?: string | null;
  vaultEntry?: string | null;
  vaultEnforceEnabled?: boolean;
  decisionDeployHash?: string | null;
  decisionExplorerUrl?: string | null;
  vaultExplorerUrl?: string | null;
  hardBlockers?: string[];
  hint?: string;
  contrast?: { unpaid?: string; paid?: string };
};

export type PublicProofAuthoring = {
  mode?: 'agent_acl' | 'public_record';
  authorizedAgentAccountHash?: string | null;
  aclEnabled?: boolean;
  canaryTransactionHash?: string | null;
  explorerUrl?: string | null;
  lastBlocked?: {
    decisionId?: string | null;
    transactionHash?: string | null;
    explorerUrl?: string | null;
    policyGate?: string | null;
    proposerVerdict?: string | null;
    criticVerdict?: string | null;
    dissentDigest?: string | null;
    enforceRevertTransactionHash?: string | null;
    enforceRevertExplorerUrl?: string | null;
    note?: string | null;
  } | null;
  userErrors?: {
    unauthorizedCaller?: number;
    mismatchedAgentField?: number;
  };
};

export type DeskStoryStep = {
  id: string;
  title: string;
  detail: string;
  href?: string | null;
  transactionHash?: string | null;
  explorerUrl?: string | null;
  enforceRevertTransactionHash?: string | null;
  enforceRevertExplorerUrl?: string | null;
  status: string;
};

export type DeskStory = {
  status: string;
  count: number;
  readyCount: number;
  tryPath: string;
  videoUrl?: string | null;
  rejectVideoUrl?: string | null;
  videoNote?: string | null;
  steps: DeskStoryStep[];
};

export type PublicProofRoleTrace = {
  agentRole?: string | null;
  verdict?: string | null;
  action?: string | null;
  reasonCodes?: string[] | null;
  reasonSummary?: string | null;
  traceSource?: string | null;
  traceProvider?: string | null;
  modelName?: string | null;
  promptHash?: string | null;
  outputHash?: string | null;
  modelClaimHash?: string | null;
  modelGenerationHash?: string | null;
  rationaleHash?: string | null;
};

export type PublicProofTrustSummary = {
  status?: string | null;
  sampleSize?: number | null;
  minSampleSize?: number | null;
  verifiedReadbackRate?: number | null;
  policyBlockedRate?: number | null;
  staleEvidenceRate?: number | null;
  paidEvidenceVerifiedRate?: number | null;
};

export type DecisionLifecycle = {
  status?: string | null;
  envelopeId?: string | null;
  blockedDecisionId?: string | null;
  blockedTransactionHash?: string | null;
  blockedExplorerUrl?: string | null;
  approvedDecisionId?: string | null;
  approvedTransactionHash?: string | null;
  approvedExplorerUrl?: string | null;
  enforceTransactionHash?: string | null;
  enforceExplorerUrl?: string | null;
};

export type RiskVerdictOffer = {
  status?: string | null;
  endpoint?: string | null;
  amount?: string | null;
  currency?: string | null;
  network?: string | null;
  unit?: string | null;
  sampleReceiptHash?: string | null;
  settlementTxHash?: string | null;
  explorerUrl?: string | null;
};

export type PublicProofVerifier = {
  source?: string | null;
  proofFile?: string | null;
  liveProofCommand?: string | null;
  oneCommand?: string | null;
  usesPublicProofEndpoint?: boolean;
  usesDashboardReceiptEndpoint?: boolean;
};

export type PublicProof = {
  status: string | null;
  action: string | null;
  decisionId: string | null;
  riskScore: number | null;
  deployHash: string | null;
  explorerUrl: string | null;
  demoUrl: string | null;
  videoUrl: string | null;
  proofDigest: string | null;
  authoring?: PublicProofAuthoring | null;
  deskStory?: DeskStory | null;
  x402?: {
    status?: string | null;
    bindingStatus?: string | null;
    receipt?: {
      bindingStatus?: string | null;
      settlementTxHash?: string | null;
      explorerUrl?: string | null;
    } | null;
  } | null;
  vault?: PublicProofVault | null;
  cheatReverts?: CheatReverts | null;
  paidAct?: PaidAct | null;
  trustSummary?: PublicProofTrustSummary | null;
  llmTrace?: { roles?: PublicProofRoleTrace[] } | null;
  decisionLifecycle?: DecisionLifecycle | null;
  riskVerdict?: RiskVerdictOffer | null;
  verifier?: PublicProofVerifier | null;
};

export async function fetchPublicProof(signal?: AbortSignal): Promise<PublicProof> {
  const response = await fetch('/api/public/proof', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Public proof failed (${response.status})`);
  }
  return (await response.json()) as PublicProof;
}

export async function runCheatScenario(
  scenarioId: string,
  options?: { live?: boolean; signal?: AbortSignal },
): Promise<CheatRunResult> {
  const live = options?.live ? '?live=true' : '';
  const response = await fetch(`/api/public/cheat/${encodeURIComponent(scenarioId)}${live}`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    signal: options?.signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Cheat run failed (${response.status})`);
  }
  return (await response.json()) as CheatRunResult;
}

export async function runPaidActStep(
  stepId: string,
  options?: { signal?: AbortSignal },
): Promise<PaidActRunResult> {
  const response = await fetch(`/api/public/paid-act/${encodeURIComponent(stepId)}`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    signal: options?.signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Paid-act run failed (${response.status})`);
  }
  return (await response.json()) as PaidActRunResult;
}
