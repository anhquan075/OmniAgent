import { ActivityIcon, RefreshCwIcon, ServerIcon, ShieldCheckIcon, ZapIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '../../lib/api';
import AgentActivityConsole from './agent-activity-console';
import { useCasperDashboardActions } from './casper-dashboard-actions';
import CasperProofPanel from './casper-proof-panel';
import { fallbackSnapshot, type DashboardSnapshot, type Payload } from './dashboard-fallback';
import { proofLabel, proofText } from './proof-labels';
import LoopStatusPanel from './loop-status';
import ReceiptHistory from './receipt-history';

export default function CasperAgentDashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(fallbackSnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState('');

  const loadSnapshot = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiFetch('/api/dashboard/snapshot?limit=8');
      if (!response.ok) throw new Error(`snapshot ${response.status}`);
      setSnapshot(await response.json());
      setRefreshedAt(new Date().toISOString());
      setError(null);
    } catch (err) {
      if (!silent) setSnapshot(fallbackSnapshot);
      setError(err instanceof Error ? err.message : 'snapshot unavailable');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
    const interval = window.setInterval(() => void loadSnapshot({ silent: true }), 8_000);
    return () => window.clearInterval(interval);
  }, [loadSnapshot]);
  const { actionBusy, actionStatus, runCycle, startLoop, stopLoop } = useCasperDashboardActions(loadSnapshot);

  const runtime = snapshot.casperAgentRuntime ?? fallbackSnapshot.casperAgentRuntime ?? {};
  const loopStatus = runtime?.loopStatus ?? {};
  const bundle = snapshot.casperProofBundle ?? fallbackSnapshot.casperProofBundle ?? {};
  const health = snapshot.backendHealth ?? fallbackSnapshot.backendHealth ?? {};
  const account = runtime.account ?? {};
  const proofScore = bundle.proofScore ?? {};
  const blockers = Array.isArray(proofScore.hardBlockers) ? proofScore.hardBlockers : [];
  const checks = proofScore.checks && typeof proofScore.checks === 'object' ? proofScore.checks : {};
  const checkRows = useMemo(() => Object.entries(checks).slice(0, 6), [checks]);
  const recovery = Array.isArray(bundle.recoveryCandidates) ? bundle.recoveryCandidates.slice(0, 4) : [];
  const signalRows = [
    { label: 'Chain', value: proofText(snapshot.network, 'casper') },
    { label: 'Signer', value: account.configured ? 'configured' : 'missing' },
    { label: 'Contract', value: account.contract?.hash ? 'configured' : 'missing' },
    { label: 'Readiness', value: `${proofScore.score ?? 0}/${proofScore.total ?? 8}` },
  ];

  return (
    <div className="casper-dashboard">
      {/* ── Topbar ── */}
      <header className="agent-topbar animate-in">
        <div className="agent-identity">
          <span className="agent-mark">
            <img src="/imgs/casper-icon.png" alt="OmniAgent mascot" width="32" height="32" />
          </span>
          <div>
            <p>OmniAgent</p>
            <h1>Casper proof console</h1>
          </div>
        </div>
        <div className="agent-actions">
          <span className="live-badge text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-casper-red-soft)' }}>
            Live
          </span>
          <span className={`status-pill ${health.status === 'ok' ? 'is-ok' : 'is-blocked'}`}>
            <ServerIcon className="h-4 w-4" />
            {proofText(health.status, 'offline')}
          </span>
          <button type="button" onClick={() => void loadSnapshot()} aria-label="Refresh Casper snapshot">
            <RefreshCwIcon className={`h-4 w-4 ${loading ? 'is-spinning' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* ── Hero banner ── */}
      <section className="agent-hero animate-in animate-in-delay-1">
        <div className="agent-command">
          <span className="agent-kicker">
            <ZapIcon className="inline h-3.5 w-3.5 mr-1.5" />
            Casper-native receipt proof
          </span>
          <h2>OmniAgent receipt console</h2>
          <p>Policy decisions, receipt digests, and Testnet readback in one review surface.</p>
          <div className="signal-strip" aria-label="Casper runtime signals">
            {signalRows.map(item => <SignalStat key={item.label} label={item.label} value={item.value} />)}
          </div>
        </div>

        <aside className="command-status" aria-label="Current proof status">
          <div className="hero-proof-mark" aria-hidden="true">
            <img src="/imgs/casper-icon.png" alt="" width="76" height="76" />
            <span>Testnet proof desk</span>
          </div>
          <small>runtime state</small>
          <b>{proofLabel(bundle.status, { stripCasperPrefix: true })}</b>
          <span>{error ? `snapshot fallback: ${error}` : proofLabel(snapshot.mode ?? 'casper runtime', { stripCasperPrefix: true })}</span>
        </aside>
      </section>

      <div className="agent-workbench">
        <div className="agent-main-stack">
          <div className="animate-in animate-in-delay-2">
            <AgentActivityConsole
              runtime={runtime}
              bundle={bundle}
              refreshedAt={refreshedAt}
              isLoading={loading}
              error={error}
            />
          </div>
          <div className="animate-in animate-in-delay-3">
            <CasperProofPanel runtime={runtime} bundle={bundle} />
          </div>
        </div>

        <aside className="agent-ops-rail">
          <div className="animate-in animate-in-delay-4">
            <LoopStatusPanel
              loopStatus={loopStatus}
              actionStatus={actionStatus}
              actionBusy={actionBusy}
              onRunCycle={runCycle}
              onStart={startLoop}
              onStop={stopLoop}
            />
          </div>
          <section className="ops-section bento-card animate-in animate-in-delay-4">
            <div className="panel-head">
              <ShieldCheckIcon className="h-4 w-4" />
              <h3>Policy gates</h3>
            </div>
            <div className="check-list">
              {checkRows.length ? checkRows.map(([key, passed]) => (
                <span key={key} className={passed ? 'is-ok' : 'is-blocked'}>
                  <b>{proofLabel(key, { stripCasperPrefix: true })}</b>
                  <small>{passed ? 'passed' : 'blocked'}</small>
                </span>
              )) : blockers.slice(0, 6).map((blocker: string) => (
                <span key={blocker} className="is-blocked">
                  <b>{proofLabel(blocker, { stripCasperPrefix: true })}</b>
                  <small>blocked</small>
                </span>
              ))}
            </div>
          </section>

          <section className="ops-section bento-card animate-in animate-in-delay-5">
            <div className="panel-head">
              <ActivityIcon className="h-4 w-4" />
              <h3>Recovery queue</h3>
            </div>
            <div className="recovery-list">
              {recovery.length ? recovery.map((item: Payload) => (
                <span key={proofText(item.blocker)}>
                  <b>{proofLabel(item.blocker, { stripCasperPrefix: true })}</b>
                  <small>{proofText(item.action)}</small>
                </span>
              )) : (
                <span>
                  <b>No recovery actions</b>
                  <small>Casper proof gates are clear.</small>
                </span>
              )}
            </div>
          </section>

          <div>
            <ReceiptHistory refreshKey={refreshedAt} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function SignalStat({ label: metricLabel, value }: { label: string; value: string }) {
  return <span className="signal-stat"><small>{metricLabel}</small><b>{value}</b></span>;
}
