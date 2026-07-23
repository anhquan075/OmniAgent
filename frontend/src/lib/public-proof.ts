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
  x402?: {
    status?: string | null;
    bindingStatus?: string | null;
    receipt?: { bindingStatus?: string | null } | null;
  } | null;
  vault?: PublicProofVault | null;
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
