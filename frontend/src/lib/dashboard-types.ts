export type TradeProofScore = {
  score: number;
  maxScore: number;
  status: string;
  hardBlocked: boolean;
  hardBlockers: string[];
  checks: Record<string, boolean>;
};

export type RecoveryCandidate = {
  id: string;
  type: string;
  label: string;
  reason: string;
  safeNextAction: string;
  canSubmitLiveTrade: boolean;
};

export type TradeWorkOrderLifecycle = {
  id: string;
  state: string;
  terminal: boolean;
  hardBlockers: string[];
  steps: Array<Record<string, string>>;
};

export type ProofBundlePayload = Record<string, any> & {
  workOrderLifecycle?: TradeWorkOrderLifecycle;
  proofScore?: TradeProofScore;
  recoveryCandidates?: RecoveryCandidate[];
  proofDigest?: string;
};
