import { useEffect, useState } from 'react';
import {
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
];

const FALLBACK_PAID_ACT: PaidActStep[] = [
  {
    id: 'probe_unpaid',
    title: 'Buy — unpaid evidence',
    order: 1,
    explanation: 'Premium RWA evidence is paywalled with native Casper x402.',
    actionLabel: 'Probe unpaid',
    expectedOutcome: 'HTTP 402 on casper:casper-test',
    status: 'ready',
  },
  {
    id: 'verify_settle',
    title: 'Verify — settle canary',
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
    title: 'Act — enforce from paid evidence',
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

  useEffect(() => {
    document.title = 'OmniAgent — Try the enforcement';
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
      <div className="try-page">
        <header className="try-page-header">
          <div className="try-page-brand">
            <p className="try-page-brand-mark">OmniAgent</p>
            <h1>Try the enforcement</h1>
            <p className="try-page-lede">
              Most finalists attest. OmniAgent enforces. A fail-closed AI debate writes a Casper
              decision receipt, then the vault applies{' '}
              <span>freeze / unfreeze / set_ltv</span>
              . Pay for evidence over native x402, then act — cheat attempts revert on-chain.
              Replayable without private keys.
            </p>
          </div>
          <nav className="try-page-nav" aria-label="Try page links">
            <a className="try-cta try-cta-primary" href="/">
              Open cockpit
            </a>
            <a className="try-cta" href="/api/public/proof" target="_blank" rel="noreferrer">
              Raw proof JSON
              <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </nav>
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
                  <strong>{vault?.enforceEnabled ? 'armed' : 'off'}</strong>
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
            <h2>Cheat Lab — try to break the vault</h2>
            <p>
              Three intentional attacks. Each one should revert on Casper with a User error — no
              collateral moves. {cheatReady}/3 explorer proofs published.
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
                          <span className="chain-proof-missing">canary pending — seed script required</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="try-cheat-btn"
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
                            {result.decisionAction || '—'}
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
              Open this page — confirm decision action and vault entry above.
            </li>
            <li>
              Run <strong>x402 buy → verify → act</strong>: Probe unpaid (402) → Verify settle →
              Enforce from paid.
            </li>
            <li>
              Click <strong>Try to cheat</strong> on each Cheat Lab card — open the explorer link and
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
              Optional:{' '}
              <a href={proof?.videoUrl || 'https://youtu.be/wcVoqJXqPhc'} target="_blank" rel="noreferrer">
                ≤90s demo video
              </a>
              .
            </li>
          </ol>
        </section>

        <footer className="try-page-footer">
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
      </div>
    </div>
  );
}
