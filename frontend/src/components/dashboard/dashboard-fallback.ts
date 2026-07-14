export type Payload = Record<string, any>;

export type DashboardSnapshot = {
  network?: string;
  mode?: string;
  casperAgentRuntime?: Payload;
  casperProofBundle?: Payload;
  backendHealth?: Payload;
  streamMeta?: Payload;
};

export const fallbackSnapshot: DashboardSnapshot = {
  network: 'casper',
  mode: 'casper-agentic-buildathon',
  casperAgentRuntime: {
    network: 'casper',
    status: 'blocked',
    account: { configured: false, contract: {}, signer: {} },
    tooling: { dryRunAvailable: true, casperClientRequiredForLiveSubmit: true },
  },
  casperProofBundle: {
    network: 'casper',
    status: 'blocked',
    proofScore: {
      score: 0,
      total: 8,
      hardBlocked: true,
      hardBlockers: ['casper_account_missing'],
      checks: {},
    },
    lifecycle: [
      { state: 'sense', status: 'waiting' },
      { state: 'decide', status: 'waiting' },
      { state: 'policy_gate', status: 'blocked' },
      { state: 'submit', status: 'not_submitted' },
      { state: 'readback', status: 'missing' },
    ],
    latestDecision: {},
    deployStatus: { status: 'not_submitted' },
    readback: { status: 'missing', verified: false },
    recoveryCandidates: [],
  },
  backendHealth: {
    status: 'offline',
    network: 'casper',
    liveSubmitEnabled: false,
    adapter: 'fastapi-casper-agent',
  },
};
