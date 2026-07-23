import { useEffect, useState } from 'react';
import {
  ArrowRightIcon,
  ExternalLinkIcon,
  LockIcon,
  ShieldCheckIcon,
  SnowflakeIcon,
  PercentIcon,
} from 'lucide-react';
import ChainProofLink from '@/components/dashboard/chain-proof-link';
import {
  fetchPublicProof,
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
    before: 'frozen: false',
    after: 'frozen: true',
    icon: 'freeze',
    canaryHash: '36d1f699ebf201e1c2617a16ee9152a56c567351ba733e2e87b944db7c325176',
  },
  {
    decision: 'approve',
    vault: 'unfreeze',
    before: 'frozen: true',
    after: 'frozen: false',
    icon: 'unfreeze',
    canaryHash: '39dc155aac0a9be1a23aa424d60d5783d5ff75fb2cb9ab51d4a630a7ea245646',
  },
];

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
  if (kind === 'freeze') return <SnowflakeIcon className="h-4 w-4" aria-hidden />;
  if (kind === 'ltv') return <PercentIcon className="h-4 w-4" aria-hidden />;
  return <LockIcon className="h-4 w-4" aria-hidden />;
}

export default function TryEnforcementPage() {
  const [proof, setProof] = useState<PublicProof | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    return () => controller.abort();
  }, []);

  const vault = proof?.vault;
  const x402Status = proof?.x402?.status ?? 'unknown';
  const binding =
    proof?.x402?.receipt?.bindingStatus ?? proof?.x402?.bindingStatus ?? null;
  const liveAction = (proof?.action || '').toLowerCase();
  const liveVault = (vault?.lastAction || '').toLowerCase();

  return (
    <div className="casper-shell relative min-h-[100dvh] w-full overflow-x-hidden">
      <div className="relative z-10 mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-glass-border)] pb-6">
          <div className="min-w-0 space-y-3">
            <p className="text-xs font-semibold tracking-[0.18em] text-[var(--color-casper-red-soft)] uppercase">
              OmniAgent
            </p>
            <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-[var(--color-casper-cream)] sm:text-4xl">
              Try the enforcement
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--color-casper-muted)] sm:text-base">
              Most finalists attest. OmniAgent enforces. A fail-closed AI debate writes a Casper
              decision receipt, then the vault applies{' '}
              <span className="text-[var(--color-casper-cream)]">freeze / unfreeze / set_ltv</span>{' '}
              — replayable without private keys.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2">
            <a className="try-cta try-cta-primary" href="/">
              Open cockpit
            </a>
            <a className="try-cta" href="/api/public/proof" target="_blank" rel="noreferrer">
              Raw proof JSON
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          </nav>
        </header>

        <section className="flight-panel try-live-panel" aria-live="polite">
          <div className="flight-panel-head">
            <h2>Live proof now</h2>
            <span>{loading ? 'loading' : proof?.status || 'unavailable'}</span>
          </div>
          {error ? (
            <p className="text-sm text-[var(--color-status-danger)]">{error}</p>
          ) : (
            <div className="try-live-grid">
              <div>
                <span>Decision</span>
                <strong className="capitalize">{proof?.action || '—'}</strong>
              </div>
              <div>
                <span>Vault entry</span>
                <strong className="capitalize">{vault?.lastAction || '—'}</strong>
              </div>
              <div>
                <span>x402</span>
                <strong>
                  {x402Status}
                  {binding ? ` / ${binding}` : ''}
                </strong>
              </div>
              <div>
                <span>Enforce</span>
                <strong>{vault?.enforceEnabled ? 'armed' : 'off'}</strong>
              </div>
            </div>
          )}
          <div className="try-link-row">
            {proof?.deployHash ? (
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
            <p className="text-sm text-[var(--color-casper-muted)]">{vault.stateDelta.summary}</p>
          ) : null}
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-[var(--color-casper-cream)]">
              Decision → vault state change
            </h2>
            <p className="text-sm text-[var(--color-casper-muted)]">
              Before / after semantics from the public action map. Explorer links are live canaries
              (ledger when available, otherwise Jul-23 finals hashes).
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {STORY.map((step) => {
              const tx = findVaultTx(vault?.recentActions, step.vault, step.canaryHash);
              const active =
                liveAction === step.decision || liveVault === step.vault.toLowerCase();
              return (
                <article
                  key={step.vault}
                  className={`flight-panel try-story-card ${active ? 'is-active' : ''}`}
                >
                  <div className="flex items-center gap-2 text-[var(--color-casper-red-soft)]">
                    <StepIcon kind={step.icon} />
                    <span className="text-xs font-semibold tracking-wide uppercase">
                      {step.decision} → {step.vault}
                    </span>
                  </div>
                  <div className="try-before-after">
                    <div>
                      <span>Before</span>
                      <code>{step.before}</code>
                    </div>
                    <ArrowRightIcon className="h-4 w-4 shrink-0 text-[var(--color-casper-faint)]" />
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
                      <ShieldCheckIcon className="h-3 w-3" />
                      {shortHash(tx.hash)}
                      <ExternalLinkIcon className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="chain-proof-missing">pending vault canary</span>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="flight-panel space-y-3">
          <div className="flight-panel-head">
            <h2>5-minute judge path</h2>
            <span>no login</span>
          </div>
          <ol className="try-judge-list">
            <li>
              Open this page — confirm decision action and vault entry above.
            </li>
            <li>
              Open{' '}
              <a href="/api/public/proof" target="_blank" rel="noreferrer">
                /api/public/proof
              </a>{' '}
              and match deploy hashes.
            </li>
            <li>
              Hit{' '}
              <a href="/api/x402/rwa-evidence" target="_blank" rel="noreferrer">
                /api/x402/rwa-evidence
              </a>{' '}
              unpaid → HTTP <strong>402</strong> on <code>casper:casper-test</code>.
            </li>
            <li>Click a vault explorer link — enforcement is a real state-changing deploy.</li>
            <li>
              Optional:{' '}
              <a href={proof?.videoUrl || 'https://youtu.be/wcVoqJXqPhc'} target="_blank" rel="noreferrer">
                ≤90s demo video
              </a>
              .
            </li>
          </ol>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-glass-border)] pt-4 text-xs text-[var(--color-casper-faint)]">
          <span>
            {proof?.decisionId ? `decisionId ${proof.decisionId}` : 'Waiting for public proof'}
            {proof?.proofDigest ? ` · ${shortHash(proof.proofDigest.replace(/^sha256:/, ''))}` : ''}
          </span>
          <a href="https://dorahacks.io/buidl/40823" target="_blank" rel="noreferrer">
            DoraHacks BUIDL 40823
          </a>
        </footer>
      </div>
    </div>
  );
}
