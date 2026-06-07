import {
  AlertTriangleIcon,
  BrainCircuitIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AgentReasoningPanel from './agent-reasoning-panel';
import ChainTxLog from './chain-tx-log';
import CompetitionReadinessStrip from './competition-readiness-strip';
import LivePreflightPanel from './live-preflight-panel';
import LoopProofRail from './loop-proof-rail';
import RecoveryCandidatePanel from './recovery-candidate-panel';
import TradeProofScorePanel from './trade-proof-score-panel';
import { TradeProofTimeline } from './trade-proof-timeline';
import {
  FocusAnalysis,
  ModelStack,
  QuantTerminalHeader,
  SignalTile,
} from './quant-terminal-widgets';
import { DecisionSummary } from './quant-terminal-market-panels';
import { apiFetch } from '../../lib/api';

type Payload = Record<string, any>;

const AUTO_REFRESH_MS = 30_000;
const SIGNER_STATUS_KEY = ['twa', 'kStatus'].join('');

const asText = (value: unknown, fallback = 'pending') => (
  value === undefined || value === null || value === '' ? fallback : String(value)
);

export function BnbTradingAgentDashboard() {
  const [state, setState] = useState<Payload>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState('waiting');

  const loadSnapshot = useCallback(async (overrides: Payload = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/dashboard/snapshot?limit=10');
      if (!response.ok) throw new Error(`dashboard ${response.status}`);
      const snapshot = await response.json() as Payload;
      setState({ ...snapshot, ...overrides });
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      setError(err instanceof Error && err.message === 'Failed to fetch' ? 'Backend dashboard unavailable' : err instanceof Error ? err.message : 'Unable to refresh cockpit');
      setLastUpdated('offline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
    const timer = window.setInterval(() => void loadSnapshot(), AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadSnapshot]);

  const ledgerEvents = useMemo(() => state.ledger?.events ?? [], [state.ledger]);
  const lifecycle = state.liveProofBundle?.workOrderLifecycle ?? state.workOrders?.lifecycle;
  const proofScore = state.liveProofBundle?.proofScore ?? state.workOrders?.proofScore;
  const workOrders = useMemo(() => {
    const fallback = state.workOrders?.workOrders ?? [];
    return lifecycle ? [{ ...lifecycle, symbol: 'BSC', side: 'trade' }] : fallback;
  }, [lifecycle, state.workOrders]);
  const recovery = useMemo(() => (
    state.liveProofBundle?.recoveryCandidates ?? state.recovery?.candidates ?? []
  ), [state.liveProofBundle, state.recovery]);
  const wallet = state.wallet ?? {};
  const signerStatus = state[SIGNER_STATUS_KEY] ?? {};
  const signerValidated = Boolean(signerStatus.ready);
  const paused = Boolean(state.ledger?.control?.emergencyPaused);
  const offline = Boolean(error);
  const mode = offline ? 'Offline' : paused ? 'Paused' : signerValidated ? 'Armed' : 'Guarded';
  const liveExecution = Boolean(state.livePreflight?.readyForLiveTrade);
  const backendHealth = state.backendHealth ?? {};
  const agentLoopEnabled = Boolean(backendHealth.autonomousLoopEnabled);
  const loopMode = agentLoopEnabled ? 'Agent loop active' : 'Agent loop idle';
  const txLogEvents = state.liveProofBundle?.txEvents?.length ? state.liveProofBundle.txEvents : ledgerEvents;
  const walletAddress = wallet.walletAddress ? String(wallet.walletAddress) : '';
  const walletLabel = walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'pending';
  const proofLabel = proofScore?.score !== undefined && proofScore?.total !== undefined ? `${proofScore.score}/${proofScore.total}` : 'checking';
  const readinessCopy = liveExecution
    ? 'Ready for a backend-controlled trade when policy allows it.'
    : paused
      ? 'Paused by policy; the cockpit stays in observation mode.'
      : 'Watching market, wallet, proof, and policy gates before action.';

  return (
    <div className={`robot-cockpit quant-terminal flex min-h-0 flex-col gap-2 ${loading ? 'is-refreshing' : ''}`}>
      <QuantTerminalHeader state={state} mode={mode} liveExecution={liveExecution} />
      <section className="quant-operator-band">
        <div className="quant-operator-copy">
          <span>Readiness</span>
          <strong>{mode}</strong>
          <p>{readinessCopy}</p>
        </div>
        <div className="quant-operator-metrics" aria-label="Dashboard readiness">
          <span><small>Market</small><b>{state.prices?.configured ? 'online' : 'waiting'}</b></span>
          <span><small>Proof</small><b>{proofLabel}</b></span>
          <span><small>Wallet</small><b>{walletLabel}</b></span>
        </div>
      </section>
      {error ? (
        <section className="quant-error quant-offline-brief" aria-live="polite">
          <div>
            <AlertTriangleIcon className="h-4 w-4" aria-hidden="true" />
            <span>API session unavailable</span>
          </div>
          <p>Read-only cockpit. Live market, wallet, and proof checks stay guarded until the backend session recovers.</p>
          <div className="quant-offline-meta" aria-label="Offline details">
            <span><small>Cause</small><b>{error}</b></span>
            <span><small>Mode</small><b>observe only</b></span>
            <span><small>Refresh</small><b>{Math.round(AUTO_REFRESH_MS / 1000)}s</b></span>
          </div>
        </section>
      ) : null}
      <div className="quant-signal-strip">
        <SignalTile label="Signal confidence" value={state.cycle?.strategyDecision?.decision?.confidence ? `${Math.round(state.cycle.strategyDecision.decision.confidence * 100)}%` : 'waiting'} hint="trade conviction" />
        <SignalTile label="Decision source" value={state.cycle?.strategyDecision?.source === 'openrouter' ? 'model' : 'observe'} hint="current mode" />
        <SignalTile label="Data coverage" value={state.prices?.configured ? '100%' : 'waiting'} hint="market feed" />
        <SignalTile label="Execution gate" value={state.livePreflight?.readyForLiveTrade ? 'ready' : 'guarded'} hint={loopMode} />
        <SignalTile label="Ledger result" value={`${asText(state.ledger?.pnl?.totalReturnPct, '0')}%`} hint="portfolio change" />
      </div>
      <LoopProofRail state={state} />
      <div className="quant-main-grid">
        <div className="quant-center-rail">
          <FocusAnalysis state={state} />
          <ModelStack state={state} />
          <section className="quant-actions quant-auto-status">
            <span>Backend agent loop</span>
            <strong>{agentLoopEnabled ? 'automatic' : 'idle'}</strong>
            <p>{liveExecution ? 'Live execution is gated by proof and signer readiness.' : 'Frontend is observation-only; execution is controlled by backend policy.'}</p>
          </section>
        </div>
      </div>
      <div className="quant-bottom-grid">
        <section className="quant-workrail">
          <div className="quant-section-title">
            <BrainCircuitIcon className="h-4 w-4 text-bnb-gold" />
            Trade plan
            <span>{asText(lifecycle?.state ?? workOrders[0]?.state, 'idle').replace(/[-_]+/g, ' ')}</span>
          </div>
          <TradeProofScorePanel score={proofScore} />
          <TradeProofTimeline workOrders={workOrders} recovery={recovery} ledgerEvents={ledgerEvents} running={loading} />
        </section>
        <div className="quant-side-stack quant-side-stack-readiness">
          <CompetitionReadinessStrip state={state} />
          <LivePreflightPanel preflight={state.livePreflight} />
          <RecoveryCandidatePanel candidates={recovery} />
        </div>
        <div className="quant-side-stack quant-side-stack-reasoning">
          <AgentReasoningPanel state={state} offline={offline} paused={paused} />
          <DecisionSummary state={state} />
          <ChainTxLog events={txLogEvents} />
        </div>
      </div>
      <p className="quant-footer">snapshot {lastUpdated} / {signerValidated ? 'signer valid' : 'signer guarded'} / {walletLabel}</p>
    </div>
  );
}

export default BnbTradingAgentDashboard;
