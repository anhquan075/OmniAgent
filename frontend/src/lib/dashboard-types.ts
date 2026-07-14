export type CasperProofScore = {
  score: number;
  total: number;
  status?: string;
  hardBlocked: boolean;
  hardBlockers: string[];
  checks: Record<string, boolean>;
};

export type CasperRecoveryCandidate = {
  blocker: string;
  action: string;
};

export type CasperLifecycleStep = {
  state: string;
  status: string;
};

export type CasperProofBundlePayload = Record<string, any> & {
  lifecycle?: CasperLifecycleStep[];
  proofScore?: CasperProofScore;
  recoveryCandidates?: CasperRecoveryCandidate[];
  proofDigest?: string;
};
