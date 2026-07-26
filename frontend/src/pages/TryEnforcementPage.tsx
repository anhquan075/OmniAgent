import { useEffect, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  LockIcon,
  ShieldCheckIcon,
  SnowflakeIcon,
  PercentIcon,
  BanIcon,
  ShieldXIcon,
  CoinsIcon,
} from 'lucide-react';
import ChainProofLink from '@/components/dashboard/chain-proof-link';
import {
  fetchPublicProof,
  runCheatScenario,
  runPaidActStep,
  type CheatRunResult,
  type CheatScenario,
  type DeskStoryStep,
  type PaidActRunResult,
  type PaidActStep,
  type PublicProof,
  type VaultRecentAction,
} from '@/lib/public-proof';

type StoryStep = {
  decision: string;
  vault: string;
  before: string;
  after: string;
  icon: 'freeze' | 'ltv' | 'unfreeze';
  canaryHash?: string;
};

type EnhancementState = 'live' | 'partial' | 'planned';

type EnhancementItem = {
  id: string;
  title: string;
  state: EnhancementState;
  metric: string;
  detail: string;
  href?: string | null;
  hrefLabel?: string;
};

const FALLBACK_DESK_STORY: DeskStoryStep[] = [
  {
    id: 'probe_unpaid',
    title: 'Probe unpaid evidence',
    detail: 'GET /api/x402/rwa-evidence without payment returns HTTP 402 on casper:casper-test.',
    href: '/api/x402/rwa-evidence',
    status: 'ready',
  },
  {
    id: 'live_haircut',
    title: 'Live haircut decision',
    detail: 'ACL-gated record_decision seals an approved haircut receipt.',
    transactionHash: '87734909bab1a83890228b59a66c64fd7636ce99eb4beeb4ac5d9c07b990bb22',
    explorerUrl:
      'https://testnet.cspr.live/deploy/87734909bab1a83890228b59a66c64fd7636ce99eb4beeb4ac5d9c07b990bb22',
    status: 'ready',
  },
  {
    id: 'cross_contract_enforce',
    title: 'Cross-contract enforce',
    detail: 'enforce_verified live-reads decision-proof and lowers LTV.',
    transactionHash: '599dc698b0d7c52bd3d0ef86f819a47459100cf289b36db5f3fada0fe4354b1b',
    explorerUrl:
      'https://testnet.cspr.live/deploy/599dc698b0d7c52bd3d0ef86f819a47459100cf289b36db5f3fada0fe4354b1b',
    status: 'ready',
  },
  {
    id: 'onchain_reject',
    title: 'On-chain reject cannot enforce',
    detail:
      'A blocked policy-gate receipt is sealed on-chain with critic dissent; vault enforce reverts (User 102).',
    status: 'pending',
  },
  {
    id: 'cheat_acl',
    title: 'Cheat Lab ACL reject',
    detail: 'Unauthorized recorder reverts with User(130).',
    transactionHash: '1b6c37f5839881af4ee0f6e6f53c1061dc6897b09180904e7e404a3660bfd23b',
    explorerUrl:
      'https://testnet.cspr.live/deploy/1b6c37f5839881af4ee0f6e6f53c1061dc6897b09180904e7e404a3660bfd23b',
    status: 'ready',
  },
];

const STORY: StoryStep[] = [
  {
    decision: 'haircut',
    vault: 'set_ltv',
    before: 'LTV 100%',
    after: 'LTV 50%',
    icon: 'ltv',
    canaryHash: '43a8c497166b0d219a9867464b6de2ea66c5a6512f725f51df9bd89341612604',
  },
  {
    decision: 'block',
    vault: 'freeze',
    before: 'Unfrozen',
    after: 'Frozen',
    icon: 'freeze',
    canaryHash: '36d1f699ebf201e1c2617a16ee9152a56c567351ba733e2e87b944db7c325176',
  },
  {
    decision: 'approve',
    vault: 'unfreeze',
    before: 'Frozen',
    after: 'Unfrozen',
    icon: 'unfreeze',
    canaryHash: '39dc155aac0a9be1a23aa424d60d5783d5ff75fb2cb9ab51d4a630a7ea245646',
  },
];

const FALLBACK_CHEATS: CheatScenario[] = [
  {
    id: 'malformed_receipt',
    title: 'Malformed receipt',
    expectedUserError: 100,
    entryPoint: 'freeze',
    errorLabel: 'User error: 100',
    explanation: 'Vault rejects a non-receipt string before any state change.',
    attack: "Call freeze with receipt='not-a-receipt'",
    expectedOutcome: 'Deploy reverts; collateral stays unfrozen',
    status: 'canary_pending',
    transactionHash: null,
    explorerUrl: null,
  },
  {
    id: 'unapproved_gate',
    title: 'Unapproved policy gate',
    expectedUserError: 102,
    entryPoint: 'freeze',
    errorLabel: 'User error: 102',
    explanation: 'A blocked decision receipt cannot freeze. The chain is the final no.',
    attack: 'Call freeze with policy_gate=blocked',
    expectedOutcome: 'Deploy reverts with User(102)',
    status: 'canary_pending',
    transactionHash: null,
    explorerUrl: null,
  },
  {
    id: 'wrong_action',
    title: 'Wrong action for entry point',
    expectedUserError: 103,
    entryPoint: 'freeze',
    errorLabel: 'User error: 103',
    explanation: 'An approve receipt cannot drive freeze.',
    attack: 'Call freeze with an approve-action receipt',
    expectedOutcome: 'Deploy reverts with User(103)',
    status: 'canary_pending',
    transactionHash: null,
    explorerUrl: null,
  },
  {
    id: 'tampered_authoritative_receipt',
    title: 'Tampered authoritative receipt',
    expectedUserError: 104,
    entryPoint: 'enforce_verified',
    errorLabel: 'User error: 104',
    explanation: 'The vault live-reads decision-proof; a caller-modified receipt cannot replace it.',
    attack: 'Change proof_digest for a real on-chain decision_id',
    expectedOutcome: 'Deploy reverts with User(104); LTV is unchanged',
    status: 'canary_pending',
    transactionHash: null,
    explorerUrl: null,
  },
  {
    id: 'unauthorized_recorder',
    title: 'Unauthorized decision recorder',
    expectedUserError: 130,
    entryPoint: 'record_decision',
    errorLabel: 'User error: 130',
    explanation: 'Only the installed agent account can record decisions on-chain.',
    attack: 'Call record_decision from a signer that is not the authorized agent',
    expectedOutcome: 'Deploy reverts with User(130); no receipt is written',
    status: 'canary_pending',
    transactionHash: null,
    explorerUrl: null,
  },
  {
    id: 'forged_agent_identity',
    title: 'Forged agent identity',
    expectedUserError: 131,
    entryPoint: 'record_decision',
    errorLabel: 'User error: 131',
    explanation: "The receipt's agent field must equal the deploy signer.",
    attack: 'Submit record_decision with agent_account_hash != signer',
    expectedOutcome: 'Deploy reverts with User(131); no receipt is written',
    status: 'canary_pending',
    transactionHash: null,
    explorerUrl: null,
  },
];

const FALLBACK_PAID_ACT: PaidActStep[] = [
  {
    id: 'probe_unpaid',
    title: 'Buy: unpaid evidence',
    order: 1,
    explanation: 'Premium RWA evidence is paywalled with native Casper x402.',
    actionLabel: 'Probe unpaid',
    expectedOutcome: 'HTTP 402 on casper:casper-test',
    status: 'ready',
  },
  {
    id: 'verify_settle',
    title: 'Verify: settle canary',
    order: 2,
    explanation: 'Finals CEP-18 settle is bound into the decision receipt.',
    actionLabel: 'Verify settle',
    expectedOutcome: 'x402 verified + bound settle TX',
    status: 'pending',
    settlementTxHash: null,
    explorerUrl: null,
  },
  {
    id: 'enforce_from_paid',
    title: 'Act: enforce paid evidence',
    order: 3,
    explanation: 'Without payment, enforce stays locked. Paid unlocks the vault path.',
    actionLabel: 'Enforce from paid',
    expectedOutcome: 'Unpaid blocked · paid unlocks',
    status: 'pending',
  },
];

const LIVE_METRIC_LABELS = ['Decision', 'Vault entry', 'x402', 'Enforce'] as const;

function shortHash(hash: string): string {
  if (hash.length < 20) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function percent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not available';
  return `${Math.round(value * 100)}%`;
}

function findVaultTx(
  recent: VaultRecentAction[] | undefined,
  entryPoint: string,
  fallbackHash?: string,
): { hash: string; explorerUrl: string } | null {
  const match = (recent || []).find(
    (item) => (item.entryPoint || '').toLowerCase() === entryPoint.toLowerCase() && item.transactionHash,
  );
  if (match?.transactionHash) {
    return {
      hash: match.transactionHash,
      explorerUrl:
        match.explorerUrl || `https://testnet.cspr.live/deploy/${match.transactionHash}`,
    };
  }
  if (fallbackHash) {
    return {
      hash: fallbackHash,
      explorerUrl: `https://testnet.cspr.live/deploy/${fallbackHash}`,
    };
  }
  return null;
}

function StepIcon({ kind }: { kind: StoryStep['icon'] }) {
  if (kind === 'freeze') return <SnowflakeIcon className="h-4 w-4" aria-hidden="true" />;
  if (kind === 'ltv') return <PercentIcon className="h-4 w-4" aria-hidden="true" />;
  return <LockIcon className="h-4 w-4" aria-hidden="true" />;
}

function LiveProofSkeleton() {
  return (
    <div className="try-live-grid" aria-busy="true" aria-label="Loading live proof">
      {LIVE_METRIC_LABELS.map((label) => (
        <div key={label}>
          <span>{label}</span>
          <strong className="try-skeleton-value" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

export default function TryEnforcementPage() {
  const [proof, setProof] = useState<PublicProof | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cheatBusyId, setCheatBusyId] = useState<string | null>(null);
  const [cheatResults, setCheatResults] = useState<Record<string, CheatRunResult>>({});
  const [cheatError, setCheatError] = useState<string | null>(null);
  const [paidBusyId, setPaidBusyId] = useState<string | null>(null);
  const [paidResults, setPaidResults] = useState<Record<string, PaidActRunResult>>({});
  const [paidError, setPaidError] = useState<string | null>(null);
  const [deskActive, setDeskActive] = useState(0);

  useEffect(() => {
    document.title = 'OmniAgent - Try the enforcement';
    const controller = new AbortController();
    void (async () => {
      try {
        setLoading(true);
        const next = await fetchPublicProof(controller.signal);
        if (!controller.signal.aborted) {
          setProof(next);
          setError(null);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load public proof');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      document.title = 'OmniAgent Casper Proof Console';
    };
  }, []);

  const vault = proof?.vault;
  const x402Status = proof?.x402?.status ?? null;
  const binding =
    proof?.x402?.receipt?.bindingStatus ?? proof?.x402?.bindingStatus ?? null;
  const liveVault = (vault?.lastAction || '').toLowerCase();
  const statusChip = loading
    ? 'Loading…'
    : error
      ? 'unavailable'
      : proof?.status || 'unavailable';
  const cheatScenarios =
    proof?.cheatReverts?.scenarios?.length ? proof.cheatReverts.scenarios : FALLBACK_CHEATS;
  const cheatReady = proof?.cheatReverts?.readyCount ?? 0;
  const paidSteps = proof?.paidAct?.steps?.length ? proof.paidAct.steps : FALLBACK_PAID_ACT;
  const paidReady = proof?.paidAct?.readyCount ?? 0;
  const deskSteps = proof?.deskStory?.steps?.length
    ? proof.deskStory.steps
    : FALLBACK_DESK_STORY;
  const deskReady = proof?.deskStory?.readyCount ?? deskSteps.filter((s) => s.status === 'ready').length;
  const deskVideo = proof?.deskStory?.videoUrl || proof?.videoUrl || 'https://youtu.be/wcVoqJXqPhc';
  const rejectVideo = proof?.deskStory?.rejectVideoUrl ?? null;
  const roleTraces = proof?.llmTrace?.roles ?? [];
  const liveRoleTraces = roleTraces.filter(
    (role) => role.traceSource && role.traceSource.toLowerCase() !== 'deterministic',
  );
  const liveRolesReady =
    roleTraces.length >= 3 &&
    liveRoleTraces.length === roleTraces.length &&
    roleTraces.every((role) => role.promptHash && role.outputHash);
  const trust = proof?.trustSummary;
  const trustSampleReady =
    typeof trust?.sampleSize === 'number' &&
    trust.sampleSize >= (trust.minSampleSize ?? 1);
  const trustRatesAgree =
    trustSampleReady &&
    (trust?.verifiedReadbackRate ?? 0) > 0 &&
    (trust?.policyBlockedRate ?? 0) > 0;
  const lifecycle = proof?.decisionLifecycle;
  const lifecycleReady =
    ['live', 'ready', 'verified'].includes((lifecycle?.status || '').toLowerCase()) &&
    Boolean(lifecycle?.blockedTransactionHash && lifecycle?.approvedTransactionHash);
  const verifier = proof?.verifier;
  const verifierReady = Boolean(verifier?.oneCommand);
  const riskVerdict = proof?.riskVerdict;
  const riskVerdictReady =
    ['live', 'ready', 'verified'].includes((riskVerdict?.status || '').toLowerCase()) &&
    Boolean(riskVerdict?.endpoint && riskVerdict?.amount && riskVerdict?.currency);
  const enhancements: EnhancementItem[] = [
    {
      id: 'paired-lifecycle',
      title: 'Reject → appeal → approve',
      state: lifecycleReady ? 'live' : proof?.authoring?.lastBlocked?.transactionHash ? 'partial' : 'planned',
      metric: lifecycleReady ? 'paired on-chain' : 'reject proof only',
      detail: lifecycleReady
        ? 'The same desk envelope shows a blocked receipt, improved evidence, then an approved enforce.'
        : 'Blocked + cannot-enforce is live. The paired approved envelope has not been published yet.',
      href: lifecycle?.blockedExplorerUrl || proof?.authoring?.lastBlocked?.explorerUrl,
      hrefLabel: 'Open reject',
    },
    {
      id: 'live-roles',
      title: 'Live proposer / critic / gate',
      state: liveRolesReady ? 'live' : roleTraces.length ? 'partial' : 'planned',
      metric: `${liveRoleTraces.length}/${Math.max(roleTraces.length, 3)} model traces`,
      detail: liveRolesReady
        ? 'Every role exposes a non-deterministic provider trace plus prompt and output hashes.'
        : roleTraces.length
          ? 'Role verdicts are visible, but at least one trace is deterministic or missing prompt/output hashes.'
          : 'No public role traces are present in this proof window.',
    },
    {
      id: 'trust-summary',
      title: 'Measured trust summary',
      state: trustRatesAgree ? 'live' : trustSampleReady ? 'partial' : 'planned',
      metric: `${trust?.sampleSize ?? 0} decisions sampled`,
      detail: trustRatesAgree
        ? 'Verified readbacks and blocked policy decisions are both reflected in the measured rates.'
        : 'The summary is public, but its rates do not yet reflect both verified readbacks and the blocked canary.',
    },
    {
      id: 'reject-film',
      title: 'Dedicated reject film',
      state: rejectVideo ? 'live' : deskVideo ? 'partial' : 'planned',
      metric: rejectVideo ? 'reject cut linked' : 'overview only',
      detail: rejectVideo
        ? 'A focused clip shows reject sealing and the User(102) cannot-enforce result.'
        : 'The general walkthrough is linked; a dedicated reject-only cut is still pending.',
      href: rejectVideo || deskVideo,
      hrefLabel: rejectVideo ? 'Watch reject cut' : 'Watch overview',
    },
    {
      id: 'one-command',
      title: 'One-command verification',
      state: verifierReady ? 'live' : verifier?.liveProofCommand ? 'partial' : 'planned',
      metric: verifierReady ? 'copy / run / pass' : 'repo script only',
      detail: verifierReady
        ? 'Judges can verify Desk Story, Cheat Lab, blocked receipt, and deploy hashes in one command.'
        : verifier?.liveProofCommand
          ? 'A repository verifier exists, but there is no zero-setup one-command wrapper yet.'
          : 'No public verifier command is advertised in the proof.',
    },
    {
      id: 'paid-verdict',
      title: 'Paid sealed risk verdict',
      state: riskVerdictReady ? 'live' : riskVerdict?.endpoint ? 'partial' : 'planned',
      metric: riskVerdictReady
        ? `${riskVerdict.amount} ${riskVerdict.currency} / ${riskVerdict.unit || 'verdict'}`
        : 'pricing not live',
      detail: riskVerdictReady
        ? 'Other agents can pay over x402 for a sealed decision ID, digest, and explorer proof.'
        : 'Paid evidence is live; the sell-side x402 risk-verdict product and pricing are not published yet.',
      href: riskVerdict?.explorerUrl || riskVerdict?.endpoint,
      hrefLabel: riskVerdict?.explorerUrl ? 'Open settlement' : 'Open endpoint',
    },
  ];
  const enhancementLiveCount = enhancements.filter((item) => item.state === 'live').length;

  async function onCheatClick(scenarioId: string) {
    setCheatError(null);
    setCheatBusyId(scenarioId);
    try {
      const result = await runCheatScenario(scenarioId, { live: false });
      setCheatResults((prev) => ({ ...prev, [scenarioId]: result }));
      if (!result.ok && result.status === 'canary_pending') {
        setCheatError(result.hint || 'Cheat canary not published yet.');
      }
    } catch (err) {
      setCheatError(err instanceof Error ? err.message : 'Cheat run failed');
    } finally {
      setCheatBusyId(null);
    }
  }

  async function onPaidActClick(stepId: string) {
    setPaidError(null);
    setPaidBusyId(stepId);
    try {
      const result = await runPaidActStep(stepId);
      setPaidResults((prev) => ({ ...prev, [stepId]: result }));
      if (!result.ok && result.hardBlockers?.length) {
        setPaidError(result.hint || result.hardBlockers.join(', '));
      }
    } catch (err) {
      setPaidError(err instanceof Error ? err.message : 'Paid-act run failed');
    } finally {
      setPaidBusyId(null);
    }
  }

  return (
    <div className="casper-shell relative min-h-[100dvh] w-full overflow-x-hidden">
      <a className="try-skip-link" href="#try-main">
        Skip to proof
      </a>
      <div className="try-page-topbar">
        <a className="try-back-link" href="/">
          <span className="try-back-icon" aria-hidden="true">
            <ArrowLeftIcon />
          </span>
          Back to proof console
        </a>
      </div>
      <main className="try-page" id="try-main">
        <header className="try-page-header">
          <div className="try-page-brand">
            <p className="try-page-brand-mark">
              <span aria-hidden="true" />
              OmniAgent / enforcement lab
            </p>
            <p className="try-page-eyebrow">Casper testnet · no wallet · replayable proof</p>
            <h1>
              Watch the agent get
              <em> overruled.</em>
            </h1>
            <p className="try-page-lede">
              A fail-closed AI debate seals its verdict on Casper. Approved decisions can move the
              vault; blocked decisions cannot. Follow one evidence packet from{' '}
              <span>HTTP 402 → debate → receipt → enforcement</span>.
            </p>
            <div className="try-proof-spine" aria-label="Proof lifecycle">
              {['Paid evidence', 'AI debate', 'Sealed receipt', 'Vault action'].map((label, index) => (
                <span key={label}>
                  <b>{String(index + 1).padStart(2, '0')}</b>
                  {label}
                </span>
              ))}
            </div>
            <nav className="try-page-nav" aria-label="Primary Try page actions">
              <a className="try-cta try-cta-primary" href="#desk-story">
                Start Desk Story
                <span className="try-cta-icon" aria-hidden="true">
                  <ArrowRightIcon />
                </span>
              </a>
              <a className="try-cta" href="/api/public/proof" target="_blank" rel="noreferrer">
                Raw proof JSON
                <span className="try-cta-icon" aria-hidden="true">
                  <ExternalLinkIcon />
                </span>
              </a>
            </nav>
          </div>
          <aside className="try-judge-route" aria-labelledby="judge-route-title">
            <div className="try-judge-route-head">
              <div>
                <p>Judge route</p>
                <h2 id="judge-route-title">Proof in five minutes</h2>
              </div>
              <span
                className={`try-proof-status${error ? ' is-error' : loading ? ' is-loading' : ''}`}
                aria-live="polite"
              >
                {statusChip}
              </span>
            </div>
            <ol>
              <li>
                <a href="#desk-story">
                  <span>01</span>
                  Replay the decision
                  <small>{deskReady}/{deskSteps.length} proofs</small>
                </a>
              </li>
              <li>
                <a href="#paid-act">
                  <span>02</span>
                  Buy → verify → act
                  <small>{paidReady}/3 ready</small>
                </a>
              </li>
              <li>
                <a href="#cheat-lab">
                  <span>03</span>
                  Break the vault
                  <small>{cheatReady}/{cheatScenarios.length} canaries</small>
                </a>
              </li>
              <li>
                <a href="#enhancement-board">
                  <span>04</span>
                  Audit the roadmap
                  <small>{enhancementLiveCount}/{enhancements.length} live</small>
                </a>
              </li>
            </ol>
          </aside>
        </header>

        <section
          className={`flight-panel try-live-panel${loading ? ' is-loading' : ''}`}
          aria-live="polite"
          aria-busy={loading || undefined}
        >
          <div className="flight-panel-head">
            <h2>Live proof now</h2>
            <span>{statusChip}</span>
          </div>
          {error && !loading ? (
            <p className="try-page-error" role="alert">
              {error}. Refresh this page, or open{' '}
              <a href="/api/public/proof" target="_blank" rel="noreferrer">
                /api/public/proof
              </a>{' '}
              directly.
            </p>
          ) : null}
          {loading ? <LiveProofSkeleton /> : null}
          {!loading && !error && proof ? (
            <>
              <div className="try-live-grid">
                <div>
                  <span>Decision</span>
                  <strong className="capitalize" translate="no">
                    {proof.action || 'none'}
                  </strong>
                </div>
                <div>
                  <span>Vault entry</span>
                  <strong className="capitalize" translate="no">
                    {vault?.lastAction || 'none'}
                  </strong>
                </div>
                <div>
                  <span>x402</span>
                  <strong translate="no">
                    {x402Status || 'unavailable'}
                    {binding ? ` / ${binding}` : ''}
                  </strong>
                </div>
                <div>
                  <span>Enforce</span>
                  <strong>
                    {vault?.enforceEnabled
                      ? vault.verificationMode === 'cross_contract'
                        ? 'proof-read'
                        : 'armed'
                      : 'off'}
                  </strong>
                </div>
              </div>
              <div className="try-link-row">
                {proof.deployHash ? (
                  <ChainProofLink
                    hash={proof.deployHash}
                    explorerUrl={proof.explorerUrl}
                    label="decision deploy"
                  />
                ) : null}
                {vault?.transactionHash ? (
                  <ChainProofLink
                    hash={vault.transactionHash}
                    explorerUrl={vault.explorerUrl}
                    label="vault deploy"
                  />
                ) : null}
                {vault?.contractHash ? (
                  <ChainProofLink
                    hash={vault.contractHash}
                    explorerUrl={vault.contractLinks?.contractHash}
                    kind="contract"
                    label="vault contract"
                  />
                ) : null}
              </div>
              {vault?.stateDelta?.summary ? (
                <p className="try-live-summary">{vault.stateDelta.summary}</p>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="try-page-section" id="cheat-lab">
          <div className="try-page-section-head">
            <h2>Cheat Lab: try to break the vault</h2>
            <p>
              Six intentional attacks against the vault and the decision-proof ACL. Each one should
              revert on Casper with a User error. No collateral moves and no forged receipts.{' '}
              {cheatReady}/{cheatScenarios.length} explorer proofs published.
            </p>
          </div>
          {cheatError ? (
            <p className="try-page-error" role="alert">
              {cheatError}
            </p>
          ) : null}
          <div className="try-page-grid">
            {cheatScenarios.map((scenario) => {
              const result = cheatResults[scenario.id];
              const busy = cheatBusyId === scenario.id;
              const txHash = result?.transactionHash || scenario.transactionHash;
              const explorerUrl = result?.explorerUrl || scenario.explorerUrl;
              const errorLabel =
                result?.errorMessage || result?.errorLabel || scenario.errorLabel;
              const shown = Boolean(result) || Boolean(txHash);
              return (
                <article key={scenario.id} className="flight-panel try-cheat-card">
                  <div className="try-card-body">
                    <div className="try-card-kicker">
                      <BanIcon className="h-4 w-4" aria-hidden="true" />
                      <span>User({scenario.expectedUserError})</span>
                    </div>
                    <h3>{scenario.title}</h3>
                    <p>{scenario.explanation}</p>
                    <p className="try-cheat-attack">
                      <ShieldXIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{scenario.attack}</span>
                    </p>
                    {shown ? (
                      <div className="try-cheat-result" aria-live="polite">
                        <strong translate="no">{errorLabel}</strong>
                        <span>{scenario.expectedOutcome}</span>
                        {txHash && explorerUrl ? (
                          <a
                            className="chain-proof-link"
                            href={explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ShieldCheckIcon className="h-3 w-3" aria-hidden="true" />
                            <span translate="no">{shortHash(txHash)}</span>
                            <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <span className="chain-proof-missing">Canary pending. Seed script required.</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="try-cheat-btn"
                    aria-label={`Try ${scenario.title} attack`}
                    disabled={busy}
                    onClick={() => void onCheatClick(scenario.id)}
                  >
                    {busy ? 'Checking chain…' : 'Try to cheat'}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="try-page-section" id="paid-act">
          <div className="try-page-section-head">
            <h2>x402 buy → verify → act</h2>
            <p>
              Unpaid evidence returns HTTP 402. A bound CEP-18 settle unlocks enforce. {paidReady}/3
              steps ready for judges (no wallet required).
            </p>
          </div>
          {paidError ? (
            <p className="try-page-error" role="alert">
              {paidError}
            </p>
          ) : null}
          <div className="try-page-grid">
            {paidSteps.map((step) => {
              const result = paidResults[step.id];
              const busy = paidBusyId === step.id;
              const txHash = result?.settlementTxHash || step.settlementTxHash;
              const explorerUrl = result?.explorerUrl || step.explorerUrl;
              const shown = Boolean(result);
              const contrast = result?.contrast;
              return (
                <article key={step.id} className="flight-panel try-paid-card">
                  <div className="try-card-body">
                    <div className="try-card-kicker">
                      <CoinsIcon className="h-4 w-4" aria-hidden="true" />
                      <span>Step {step.order}</span>
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.explanation}</p>
                    {shown ? (
                      <div className="try-paid-result" aria-live="polite">
                        <strong translate="no">
                          {result?.httpStatus
                            ? `HTTP ${result.httpStatus}`
                            : result?.status}
                          {result?.unlocked ? ' · unlocked' : ''}
                        </strong>
                        <span>{result?.expectedOutcome || step.expectedOutcome}</span>
                        {contrast ? (
                          <div className="try-paid-contrast">
                            <span>
                              <em>Unpaid</em> {contrast.unpaid}
                            </span>
                            <span>
                              <em>Paid</em> {contrast.paid}
                            </span>
                          </div>
                        ) : null}
                        {result?.decisionAction || result?.vaultEntry ? (
                          <span translate="no">
                            {result.decisionAction || 'Not available'}
                            {result.vaultEntry ? ` → ${result.vaultEntry}` : ''}
                          </span>
                        ) : null}
                        {txHash && explorerUrl ? (
                          <a
                            className="chain-proof-link"
                            href={explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ShieldCheckIcon className="h-3 w-3" aria-hidden="true" />
                            <span translate="no">{shortHash(txHash)}</span>
                            <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="try-paid-btn"
                    disabled={busy}
                    onClick={() => void onPaidActClick(step.id)}
                  >
                    {busy ? 'Running…' : step.actionLabel}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="try-page-section" id="desk-story">
          <div className="try-page-section-head">
            <h2>Desk Story: financeability gate</h2>
            <p>
              Five guided steps a collateral desk can replay: unpaid 402 → approved haircut →
              cross-contract enforce → on-chain reject that cannot move collateral → ACL cheat.{' '}
              {deskReady}/{deskSteps.length} explorer proofs ready.
            </p>
          </div>
          <div className="try-desk-toolbar">
            <a className="try-cta try-cta-primary" href={deskVideo} target="_blank" rel="noreferrer">
              Watch ≤90s walkthrough
              <span className="try-cta-icon" aria-hidden="true">
                <ExternalLinkIcon />
              </span>
            </a>
            <p className="try-desk-video-note">
              {proof?.deskStory?.videoNote ||
                'Filmed path covers enforce + reject-cannot-enforce; click each step for live explorer links.'}
            </p>
          </div>
          <div className="try-desk-stage">
            <ol className="try-desk-steps">
              {deskSteps.map((step, index) => {
                const active = deskActive === index;
                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      className={`flight-panel try-desk-step${active ? ' is-active' : ''}${
                        step.status === 'ready' ? ' is-ready' : ''
                      }`}
                      aria-current={active ? 'step' : undefined}
                      onClick={() => setDeskActive(index)}
                    >
                      <span className="try-desk-index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="try-desk-copy">
                        <strong>{step.title}</strong>
                        <span>{step.detail}</span>
                      </span>
                      <span className="try-desk-status">{step.status}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {deskSteps[deskActive] ? (
              <div className="try-desk-detail-shell">
                <div className="flight-panel try-desk-detail">
                  <div className="flight-panel-head">
                    <h3>
                      Step {deskActive + 1}: {deskSteps[deskActive].title}
                    </h3>
                    <span>{deskSteps[deskActive].status}</span>
                  </div>
                  <p>{deskSteps[deskActive].detail}</p>
                  <div className="try-link-row">
                    {deskSteps[deskActive].href ? (
                      <a
                        className="try-cta"
                        href={deskSteps[deskActive].href!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open endpoint
                        <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                    {deskSteps[deskActive].transactionHash && deskSteps[deskActive].explorerUrl ? (
                      <a
                        className="chain-proof-link"
                        href={deskSteps[deskActive].explorerUrl!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ShieldCheckIcon className="h-3 w-3" aria-hidden="true" />
                        <span translate="no">{shortHash(deskSteps[deskActive].transactionHash!)}</span>
                        <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ) : null}
                    {deskSteps[deskActive].enforceRevertTransactionHash &&
                    deskSteps[deskActive].enforceRevertExplorerUrl ? (
                      <a
                        className="chain-proof-link"
                        href={deskSteps[deskActive].enforceRevertExplorerUrl!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ShieldXIcon className="h-3 w-3" aria-hidden="true" />
                        <span translate="no">
                          revert {shortHash(deskSteps[deskActive].enforceRevertTransactionHash!)}
                        </span>
                        <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                  <div className="try-desk-nav">
                    <button
                      type="button"
                      className="try-cta"
                      disabled={deskActive <= 0}
                      onClick={() => setDeskActive((n) => Math.max(0, n - 1))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="try-cta try-cta-primary"
                      disabled={deskActive >= deskSteps.length - 1}
                      onClick={() => setDeskActive((n) => Math.min(deskSteps.length - 1, n + 1))}
                    >
                      Next step
                      <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="try-page-section" id="enhancement-board">
          <div className="try-page-section-head try-enhancement-head">
            <div>
              <p className="try-enhancement-eyebrow">Podium proof manifest</p>
              <h2>Enhancement board</h2>
            </div>
            <span className="try-enhancement-count">
              {enhancementLiveCount}/{enhancements.length} live
            </span>
          </div>
          <p className="try-enhancement-intro">
            This board reads the public proof API. A card turns green only when its required hashes,
            metrics, or product fields are published; planned work is never presented as shipped.
          </p>
          <div className="try-enhancement-grid">
            {enhancements.map((item, index) => (
              <article
                key={item.id}
                className={`flight-panel try-enhancement-card is-${item.state}`}
              >
                <div className="try-enhancement-card-head">
                  <span className="try-enhancement-sequence">{String(index + 1).padStart(2, '0')}</span>
                  <span className={`try-enhancement-state is-${item.state}`}>{item.state}</span>
                </div>
                <div className="try-enhancement-copy">
                  <h3>{item.title}</h3>
                  <strong>{item.metric}</strong>
                  <p>{item.detail}</p>
                </div>

                {item.id === 'live-roles' && roleTraces.length ? (
                  <div className="try-enhancement-evidence">
                    {roleTraces.map((role) => (
                      <div key={`${role.agentRole}-${role.verdict}`}>
                        <span>{role.agentRole || 'role'}</span>
                        <strong>{role.verdict || 'unknown'}</strong>
                        <code>{role.traceSource || 'source missing'}</code>
                      </div>
                    ))}
                  </div>
                ) : null}

                {item.id === 'trust-summary' && trust ? (
                  <div className="try-enhancement-evidence try-trust-evidence">
                    <div>
                      <span>Readback</span>
                      <strong>{percent(trust.verifiedReadbackRate)}</strong>
                    </div>
                    <div>
                      <span>Blocked</span>
                      <strong>{percent(trust.policyBlockedRate)}</strong>
                    </div>
                    <div>
                      <span>Paid evidence</span>
                      <strong>{percent(trust.paidEvidenceVerifiedRate)}</strong>
                    </div>
                  </div>
                ) : null}

                {item.id === 'paired-lifecycle' && lifecycleReady ? (
                  <div className="try-link-row">
                    {lifecycle?.blockedExplorerUrl ? (
                      <a
                        className="chain-proof-link"
                        href={lifecycle.blockedExplorerUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ShieldXIcon className="h-3 w-3" aria-hidden="true" />
                        blocked {shortHash(lifecycle.blockedTransactionHash!)}
                      </a>
                    ) : null}
                    {lifecycle?.approvedExplorerUrl ? (
                      <a
                        className="chain-proof-link"
                        href={lifecycle.approvedExplorerUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ShieldCheckIcon className="h-3 w-3" aria-hidden="true" />
                        approved {shortHash(lifecycle.approvedTransactionHash!)}
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {item.id === 'one-command' && verifier?.oneCommand ? (
                  <code className="try-enhancement-command">{verifier.oneCommand}</code>
                ) : null}

                {item.href ? (
                  <a className="try-enhancement-link" href={item.href} target="_blank" rel="noreferrer">
                    {item.hrefLabel || 'Open proof'}
                    <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="try-enhancement-pending">Waiting for public proof fields</span>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="try-page-section">
          <div className="try-page-section-head">
            <h2>Decision → vault state change</h2>
            <p>
              Before / after semantics from the public action map. Explorer links are live canaries
              (ledger when available, otherwise Jul-23 finals hashes).
            </p>
          </div>
          <div className="try-page-grid">
            {STORY.map((step) => {
              const tx = findVaultTx(vault?.recentActions, step.vault, step.canaryHash);
              const active =
                !loading &&
                liveVault === step.vault.toLowerCase();
              return (
                <article
                  key={step.vault}
                  className={`flight-panel try-story-card ${active ? 'is-active' : ''}`}
                >
                  <div className="try-card-kicker">
                    <StepIcon kind={step.icon} />
                    <span>
                      {step.decision} → {step.vault}
                    </span>
                  </div>
                  <div className="try-before-after">
                    <div>
                      <span>Before</span>
                      <code>{step.before}</code>
                    </div>
                    <ArrowRightIcon
                      className="h-4 w-4 shrink-0 text-[var(--color-casper-faint)]"
                      aria-hidden="true"
                    />
                    <div>
                      <span>After</span>
                      <code>{step.after}</code>
                    </div>
                  </div>
                  {tx ? (
                    <a
                      className="chain-proof-link"
                      href={tx.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ShieldCheckIcon className="h-3 w-3" aria-hidden="true" />
                      <span translate="no">{shortHash(tx.hash)}</span>
                      <ExternalLinkIcon className="h-3 w-3" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="chain-proof-missing">pending vault canary</span>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="flight-panel try-judge-panel">
          <div className="flight-panel-head">
            <h2>5-minute judge path</h2>
            <span>no login</span>
          </div>
          <ol className="try-judge-list">
            <li>
              Walk the <a href="#desk-story">Desk Story</a>: unpaid 402 → haircut → enforce →
              on-chain reject cannot-enforce → ACL cheat.
            </li>
            <li>
              Open this page, then confirm the decision action and vault entry above.
            </li>
            <li>
              Run <strong>x402 buy → verify → act</strong>: Probe unpaid (402) → Verify settle →
              Enforce from paid.
            </li>
            <li>
              Click <strong>Try to cheat</strong> on each Cheat Lab card, then open the explorer link and
              confirm the User error.
            </li>
            <li>
              Open{' '}
              <a href="/api/public/proof" target="_blank" rel="noreferrer">
                /api/public/proof
              </a>{' '}
              and match <code>paidAct</code> + <code>cheatReverts</code> + deploy hashes.
            </li>
            <li>
              Review the <a href="#enhancement-board">Enhancement board</a>. Green means the required
              public proof fields are live; partial and planned items are explicitly labeled.
            </li>
            <li>
              Optional:{' '}
              <a href={proof?.videoUrl || 'https://youtu.be/wcVoqJXqPhc'} target="_blank" rel="noreferrer">
                ≤90s demo video
              </a>
              .
            </li>
          </ol>
        </section>

        <footer className="try-page-footer">
          <a className="try-back-link" href="/">
            <span className="try-back-icon" aria-hidden="true">
              <ArrowLeftIcon />
            </span>
            Back to proof console
          </a>
          <span translate="no">
            {loading
              ? 'Loading public proof…'
              : proof?.decisionId
                ? `decisionId ${proof.decisionId}`
                : 'Public proof unavailable'}
            {!loading && proof?.proofDigest
              ? ` · ${shortHash(proof.proofDigest.replace(/^sha256:/, ''))}`
              : ''}
          </span>
          <a href="https://dorahacks.io/buidl/40823" target="_blank" rel="noreferrer">
            DoraHacks BUIDL 40823
          </a>
        </footer>
      </main>
    </div>
  );
}
