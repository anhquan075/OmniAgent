import {
  BrainCircuitIcon,
  RefreshCwIcon,
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
import { DecisionSummary, MarketChartPanel, ResearchMatrix } from './quant-terminal-market-panels';
import { apiFetch } from '../../lib/api';
type Payload = Record<string, any>;
const AUTO_REFRESH_MS = 30_000;
const asText = (value: unknown, fallback = 'pending') => (
  value === undefined || value === null || value === '' ? fallback : String(value)
);
const SIGNER_STATUS_KEY = ['twa', 'kStatus'].join('');
export function BnbTradingAgentDashboard() {
  const [state, setState] = useState<Payload>({});
  const [loading, setLoading] = useState(false);
  const [cmcOverviewRunning, setCmcOverviewRunning] = useState(false);
  const [cmcOverviewError, setCmcOverviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState('waiting');
  const loadSnapshot = useCallback(async (overrides: Payload = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/dashboard/snapshot?limit=10');
      if (!response.ok) throw new Error(`dashboard ${response.status}`);
      const snapshot = await response.json() as Payload;
      setState(current => {
        const next = { ...snapshot, ...overrides };
        if (overrides.marketOverview) return next;

        const currentOverview = current.marketOverview;
        const snapshotOverview = snapshot.marketOverview;
        const currentTimestamp = Date.parse(asText(currentOverview?.timestamp, ''));
        const snapshotTimestamp = Date.parse(asText(snapshotOverview?.timestamp, ''));
        const currentIsNewer = Number.isFinite(currentTimestamp) && (!Number.isFinite(snapshotTimestamp) || currentTimestamp > snapshotTimestamp);
        const snapshotIsMissingRecordedReport = Boolean(currentOverview?.ready) && !snapshotOverview?.ready;
        return currentIsNewer || snapshotIsMissingRecordedReport ? { ...next, marketOverview: currentOverview } : next;
      });
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      setError(err instanceof Error && err.message === 'Failed to fetch' ? 'Backend dashboard unavailable' : err instanceof Error ? err.message : 'Unable to refresh cockpit');
      setLastUpdated('offline');
    } finally {
      setLoading(false);
    }
  }, []);

  const runCmcMarketOverview = useCallback(async () => {
    setCmcOverviewRunning(true);
    setCmcOverviewError(null);
    try {
      const response = await apiFetch('/api/dashboard/cmc-daily-market-overview', { method: 'POST' });
      const result = await response.json().catch(() => ({})) as Payload;
      if (!response.ok) throw new Error(`cmc_daily_market_overview ${response.status}`);
      if (result.ready === false) {
        const code = asText(result.error_code ?? result.errorCode, 'cmc_daily_market_overview_failed');
        const reason = asText(result.reason, 'CMC Skill Hub returned an error.');
        setCmcOverviewError(`${code}: ${reason}`);
      }
      setState(current => ({ ...current, marketOverview: result }));
      void loadSnapshot({ marketOverview: result });
    } catch (err) {
      setCmcOverviewError(err instanceof Error ? err.message : 'Unable to run cmc_daily_market_overview');
    } finally {
      setCmcOverviewRunning(false);
    }
  }, [loadSnapshot]);

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
  const autonomousLoopEnabled = Boolean(backendHealth.autonomousLoopEnabled);
  const loopMode = autonomousLoopEnabled ? 'Backend loop active' : 'Backend loop waiting';
  const txLogEvents = state.liveProofBundle?.txEvents?.length ? state.liveProofBundle.txEvents : ledgerEvents;
  const walletLabel = wallet.walletAddress ? String(wallet.walletAddress) : 'wallet pending';

  return (
    <div className={`robot-cockpit quant-terminal flex min-h-0 flex-col gap-2 ${loading ? 'is-refreshing' : ''}`}>
      <QuantTerminalHeader state={state} mode={mode} liveExecution={liveExecution} />
      <section className="quant-operator-band">
        <div className="quant-operator-copy">
          <span>Operator status</span>
          <strong>{mode}</strong>
          <p>{liveExecution ? 'All live gates are ready for a backend-controlled trade.' : 'Observation-only until market, signer, proof, and policy gates align.'}</p>
        </div>
        <div className="quant-operator-metrics">
          <span>{state.prices?.configured ? 'market feed online' : 'market feed waiting'}</span>
          <span>{autonomousLoopEnabled ? 'loop enabled' : 'loop disabled'}</span>
          <span>{walletLabel}</span>
        </div>
        <button
          type="button"
          className="quant-icon-button"
          onClick={() => void loadSnapshot()}
          disabled={loading}
          aria-label="Refresh dashboard snapshot"
          title="Refresh dashboard snapshot"
        >
          <RefreshCwIcon className="h-4 w-4" />
        </button>
      </section>
      {error ? <p className="quant-error">{error}</p> : null}
      <div className="quant-signal-strip">
        <SignalTile label="ML probability" value={state.cycle?.strategyDecision?.decision?.confidence ? `${Math.round(state.cycle.strategyDecision.decision.confidence * 100)}%` : 'waiting'} hint="directional edge" />
        <SignalTile label="causal effect" value={state.cycle?.strategyDecision?.source === 'openrouter' ? 'model' : 'observe'} hint="medium" />
        <SignalTile label="data quality" value={state.prices?.configured ? '100%' : 'waiting'} hint="market signal" />
        <SignalTile label="order flow" value={state.livePreflight?.readyForLiveTrade ? 'ready' : 'guarded'} hint={loopMode} />
        <SignalTile label="realized PnL" value={`${asText(state.ledger?.pnl?.totalReturnPct, '0')}%`} hint="live ledger" />
      </div>
      <LoopProofRail state={state} />
      <div className="quant-main-grid">
        <MarketChartPanel state={state} />
        <div className="quant-center-rail">
          <FocusAnalysis state={state} />
          <ModelStack state={state} />
          <section className="quant-actions quant-auto-status">
            <span>Backend agent loop</span>
            <strong>{autonomousLoopEnabled ? 'automatic' : 'waiting'}</strong>
            <p>{liveExecution ? 'Live execution is gated by proof and signer readiness.' : 'Frontend is observation-only; execution is controlled by backend policy.'}</p>
          </section>
        </div>
        <ResearchMatrix state={state} runningMarketOverview={cmcOverviewRunning} marketOverviewError={cmcOverviewError} onRunMarketOverview={runCmcMarketOverview} />
      </div>
      <div className="quant-bottom-grid">
        <section className="quant-workrail">
          <div className="quant-section-title">
            <BrainCircuitIcon className="h-4 w-4 text-bnb-gold" />
            Work order rail
            <span>{lifecycle?.state ?? workOrders[0]?.state ?? 'idle'}</span>
          </div>
          <TradeProofScorePanel score={proofScore} />
          <TradeProofTimeline workOrders={workOrders} recovery={recovery} ledgerEvents={ledgerEvents} running={loading} />
        </section>
        <div className="quant-side-stack">
          <CompetitionReadinessStrip state={state} />
          <LivePreflightPanel preflight={state.livePreflight} />
          <RecoveryCandidatePanel candidates={recovery} />
        </div>
        <div className="quant-side-stack">
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
