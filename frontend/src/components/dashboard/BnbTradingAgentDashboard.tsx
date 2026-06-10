import {
  AlertTriangleIcon,
  BrainCircuitIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AgentReasoningPanel from './agent-reasoning-panel';
import BacktestRiskReportPanel from './backtest-risk-report-panel';
import BnbAgentRuntimePanel from './bnb-agent-runtime-panel';
import ChainTxLog from './chain-tx-log';
import CompetitionReadinessStrip from './competition-readiness-strip';
import ExecutedTradeHistory from './executed-trade-history';
import LedgerMemoryPanel from './ledger-memory-panel';
import LivePreflightPanel from './live-preflight-panel';
import LoopProofRail from './loop-proof-rail';
import RecoveryCandidatePanel from './recovery-candidate-panel';
import TradeProofScorePanel from './trade-proof-score-panel';
import {
  DecisionContextPanel,
  QuantTerminalHeader,
  SignalTile,
} from './quant-terminal-widgets';
import { DecisionSummary } from './quant-terminal-market-panels';
import { registrationPnlView } from './pnl-metrics';
import { apiFetch } from '../../lib/api';

type Payload = Record<string, any>;

const AUTO_REFRESH_MS = 30_000;
const SIGNER_STATUS_KEY = ['twa', 'kStatus'].join('');

const asText = (value: unknown, fallback = 'pending') => (
  value === undefined || value === null || value === '' ? fallback : String(value)
);

const timeOnly = (value: unknown) => {
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleTimeString([], { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' })} UTC`;
};

export function BnbTradingAgentDashboard() {
  const [state, setState] = useState<Payload>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState('syncing');

  const loadSnapshot = useCallback(async (overrides: Payload = {}) => {
    setLoading(true);
    setError(null);
    try {
      const [response, executedTrades] = await Promise.all([
        apiFetch('/api/dashboard/snapshot?limit=10'),
        apiFetch('/api/dashboard/trades?limit=500')
          .then(async (tradeResponse) => {
            if (!tradeResponse.ok) return { status: 'unavailable', trades: [], error: `trades ${tradeResponse.status}` };
            return await tradeResponse.json() as Payload;
          })
          .catch((tradeError) => ({
            status: 'unavailable',
            trades: [],
            error: tradeError instanceof Error ? tradeError.message : 'trade history unavailable',
          })),
      ]);
      if (!response.ok) throw new Error(`dashboard ${response.status}`);
      const snapshot = await response.json() as Payload;
      setState({ ...snapshot, executedTrades, ...overrides });
      setLastUpdated(`${new Date().toLocaleTimeString([], { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' })} UTC`);
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
  const liveExecution = Boolean(state.livePreflight?.readyForLiveTrade);
  const backendHealth = state.backendHealth ?? {};
  const autonomousLoop = backendHealth.autonomousLoop ?? {};
  const agentLoopEnabled = Boolean(backendHealth.autonomousLoopEnabled);
  const nextRunTime = timeOnly(autonomousLoop.nextRunAt);
  const mode = offline ? 'Offline' : agentLoopEnabled ? 'Active' : signerValidated ? 'Armed' : 'Live';
  const loopMode = offline ? 'backend session' : agentLoopEnabled ? '24/7 live' : nextRunTime ? `cycle ${nextRunTime}` : 'policy live';
  const txLogEvents = state.liveProofBundle?.txEvents?.length ? state.liveProofBundle.txEvents : ledgerEvents;
  const walletAddress = wallet.walletAddress ? String(wallet.walletAddress) : '';
  const pnl = registrationPnlView(state.ledger);
  const walletLabel = walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : offline ? 'offline' : 'syncing';
  const proofTotal = proofScore?.total ?? proofScore?.maxScore;
  const proofLabel = proofScore?.score !== undefined && proofTotal !== undefined ? `${proofScore.score}/${proofTotal}` : offline ? 'offline' : 'checking';
  const marketLabel = state.prices?.configured ? 'online' : offline ? 'offline' : 'syncing';
  const signalConfidenceLabel = state.cycle?.strategyDecision?.decision?.confidence ? `${Math.round(state.cycle.strategyDecision.decision.confidence * 100)}%` : offline ? 'offline' : 'scanning';
  const strategySourceLabel = offline ? 'offline' : state.cycle?.strategyDecision?.source === 'openrouter' ? 'model' : state.cycle?.strategyDecision?.source ? 'policy' : agentLoopEnabled ? 'policy' : 'scanning';
  const dataCoverageLabel = state.prices?.configured ? '100%' : offline ? 'offline' : 'syncing';
  const loopStatusLabel = offline
    ? 'reconnecting'
    : agentLoopEnabled && autonomousLoop.execute === false
      ? asText(autonomousLoop.mode, 'dry_run').replace(/_/g, ' ')
      : agentLoopEnabled ? asText(autonomousLoop.phase, 'monitoring') : asText(autonomousLoop.state, 'active');
  const readinessCopy = liveExecution
    ? 'Ready for a backend-controlled trade when policy allows it.'
    : 'Agent loop is live 24/7 and continuously monitors market, wallet, proof, and policy gates.';

  return (
    <div className={`robot-cockpit quant-terminal flex min-h-0 flex-col gap-2 ${loading ? 'is-refreshing' : ''}`}>
      <QuantTerminalHeader state={state} mode={mode} liveExecution={liveExecution} offline={offline} />
      <div className="quant-priority-row">
        <DecisionSummary state={state} />
        <div className="quant-signal-stack">
          <div className="quant-signal-strip">
            <SignalTile label="Signal" value={signalConfidenceLabel} hint={offline ? 'backend session' : 'trade conviction'} />
            <SignalTile label="Source" value={strategySourceLabel} hint="current mode" />
            <SignalTile label="Coverage" value={dataCoverageLabel} hint={offline ? 'backend session' : 'market feed'} />
            <SignalTile label="Gate" value={state.livePreflight?.readyForLiveTrade ? 'ready' : agentLoopEnabled ? 'live' : 'guarded'} hint={loopMode} />
            <SignalTile label={pnl.metricLabel} value={pnl.label} hint={pnl.hint} />
          </div>
          <section className={`quant-operator-band quant-status-band ${error ? 'has-error' : ''}`}>
            <div className="quant-operator-copy">
              <span>Readiness</span>
              <strong>{mode}</strong>
              <p>{readinessCopy}</p>
            </div>
            <div className="quant-operator-metrics" aria-label="Dashboard readiness">
              <span><small>Market</small><b>{marketLabel}</b></span>
              <span className={pnl.tone}><small>{pnl.metricLabel}</small><b>{pnl.label}</b></span>
              <span><small>Proof</small><b>{proofLabel}</b></span>
              <span><small>Wallet</small><b>{walletLabel}</b></span>
            </div>
            {error ? (
              <div className="quant-error quant-offline-brief" aria-live="polite">
                <div>
                  <AlertTriangleIcon className="h-4 w-4" aria-hidden="true" />
                  <span>API session unavailable</span>
                </div>
                <p>Live market, wallet, and proof checks stay guarded until the backend session recovers.</p>
                <div className="quant-offline-meta" aria-label="Offline details">
                  <span><small>Cause</small><b>{error}</b></span>
                  <span><small>Mode</small><b>reconnect</b></span>
                  <span><small>Refresh</small><b>{Math.round(AUTO_REFRESH_MS / 1000)}s</b></span>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
      <div className="quant-main-grid">
        <DecisionContextPanel state={state} offline={offline} loopStatusLabel={loopStatusLabel} liveExecution={liveExecution} />
        <BnbAgentRuntimePanel runtime={state.bnbAgentRuntime} />
        <BacktestRiskReportPanel report={state.backtestRiskReport} />
      </div>
      <LoopProofRail state={state} offline={offline} />
      <div className="quant-bottom-grid">
        <section className="quant-workrail">
          <div className="quant-section-title">
            <BrainCircuitIcon className="h-4 w-4 text-bnb-gold" />
            Trade plan
            <span>{asText(lifecycle?.state ?? workOrders[0]?.state, 'active').replace(/blocked|waiting|paused/gi, 'guarded').replace(/[-_]+/g, ' ')}</span>
          </div>
          <TradeProofScorePanel score={proofScore} state={state} />
          <LedgerMemoryPanel memory={state.ledgerMemory} />
        </section>
        <div className="quant-side-stack quant-side-stack-readiness">
          <CompetitionReadinessStrip state={state} />
          <LivePreflightPanel preflight={state.livePreflight} />
          <RecoveryCandidatePanel candidates={recovery} />
        </div>
        <div className="quant-side-stack quant-side-stack-reasoning">
          <AgentReasoningPanel state={state} offline={offline} paused={paused} />
        </div>
        <div className="quant-execution-stack" aria-label="Backend execution evidence">
          <ChainTxLog events={txLogEvents} />
          <ExecutedTradeHistory history={state.executedTrades} loading={loading} />
        </div>
      </div>
      <p className="quant-footer">snapshot {lastUpdated} / {signerValidated ? 'signer valid' : 'signer guarded'} / {walletLabel}</p>
    </div>
  );
}

export default BnbTradingAgentDashboard;
