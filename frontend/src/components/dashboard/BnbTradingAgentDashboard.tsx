import {
  BotIcon,
  BrainCircuitIcon,
  Loader2Icon,
  PauseCircleIcon,
  PlayCircleIcon,
  RadioTowerIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AgentReasoningPanel from './agent-reasoning-panel';
import ChainTxLog from './chain-tx-log';
import CompetitionReadinessStrip from './competition-readiness-strip';
import LiveProofBundlePanel from './live-proof-bundle-panel';
import LivePreflightPanel from './live-preflight-panel';
import ProofReportSummary from './proof-report-summary';
import RecoveryCandidatePanel from './recovery-candidate-panel';
import { Metric } from './robot-cockpit-primitives';
import TradeProofScorePanel from './trade-proof-score-panel';
import { TradeProofTimeline } from './trade-proof-timeline';
import { apiFetch } from '../../lib/api';
import { callMcpTool } from '../../lib/mcp';

type Payload = Record<string, any>;
const AUTO_REFRESH_MS = 30_000;

const asText = (value: unknown, fallback = 'pending') => (
  value === undefined || value === null || value === '' ? fallback : String(value)
);
export function BnbTradingAgentDashboard() {
  const [state, setState] = useState<Payload>({});
  const [loading, setLoading] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState('waiting');

  const runTool = useCallback(async (tool: string, params: Payload = {}) => {
    const response = await callMcpTool(null, tool, params);
    return (response.result ?? response) as Payload;
  }, []);

  const loadSnapshot = useCallback(async (overrides: Payload = {}) => {
    setLoading(true);
    setError(null);
    try {
      const [snapshotResult, preflightResult, proofBundleResult, healthResult] = await Promise.allSettled([
        runTool('bnb_agent_cockpit_snapshot', { limit: 10 }),
        runTool('bnb_live_preflight', { skipFundedCycle: true }),
        runTool('bnb_live_proof_bundle', { limit: 8 }),
        apiFetch('/api/health').then(async (response) => {
          if (!response.ok) throw new Error(`health ${response.status}`);
          return response.json() as Promise<Payload>;
        }),
      ]);
      if (snapshotResult.status === 'rejected') throw snapshotResult.reason;
      const livePreflight = preflightResult.status === 'fulfilled' ? preflightResult.value : { status: 'unavailable', blockers: [{ name: 'preflight', reason: String(preflightResult.reason) }] };
      const liveProofBundle = proofBundleResult.status === 'fulfilled' ? proofBundleResult.value : { status: 'unavailable', blockers: [{ name: 'proof_bundle', reason: String(proofBundleResult.reason) }] };
      const backendHealth = healthResult.status === 'fulfilled' ? healthResult.value : { status: 'unavailable', reason: String(healthResult.reason) };
      setState({ ...snapshotResult.value, backendHealth, livePreflight, liveProofBundle, ...overrides });
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      setError(err instanceof Error && err.message === 'Failed to fetch' ? 'MCP API unavailable' : err instanceof Error ? err.message : 'Unable to refresh cockpit');
      setLastUpdated('offline');
    } finally {
      setLoading(false);
    }
  }, [runTool]);

  useEffect(() => {
    void loadSnapshot();
    const timer = window.setInterval(() => void loadSnapshot(), AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadSnapshot]);

  const runPipeline = async () => {
    setPipelineRunning(true);
    setError(null);
    try {
      const cycle = await runTool('bnb_run_autonomous_cycle', {
        symbol: 'BNB',
        side: 'sell',
        amountUsd: 0.25,
        slippageBps: 50,
        signalSource: 'cmc',
        execute: Boolean(state.livePreflight?.readyForLiveTrade),
      });
      await loadSnapshot({
        cycle,
        risk: cycle.risk,
        simulation: cycle.execution,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run autonomous cycle');
    } finally {
      setPipelineRunning(false);
      setLoading(false);
    }
  };

  const togglePause = async () => {
    setPipelineRunning(true);
    setError(null);
    try {
      await runTool('bnb_emergency_pause', { enabled: !state.ledger?.control?.emergencyPaused });
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update pause state');
    } finally {
      setPipelineRunning(false);
    }
  };

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
  const registrationEvent = ledgerEvents.find((event: Payload) => event.eventType === 'competition_registered');
  const wallet = state.wallet ?? {};
  const server = wallet.twakServer ?? {};
  const twakStatus = state.twakStatus ?? {};
  const twakValidated = Boolean(twakStatus.ready);
  const paused = Boolean(state.ledger?.control?.emergencyPaused);
  const offline = Boolean(error);
  const mode = offline ? 'Offline' : paused ? 'Paused' : twakValidated ? 'Armed' : 'Guarded';
  const walletAddress = asText(wallet.walletAddress, 'not linked');
  const sdk = state.sdkStatus ?? {};
  const paidStatus = state.paidStatus ?? {};
  const x402Value = paidStatus.ready ? 'ready' : paidStatus.x402Configured ? 'verify' : 'gap';
  const liveExecution = Boolean(state.livePreflight?.readyForLiveTrade);
  const backendHealth = state.backendHealth ?? {};
  const autonomousLoopEnabled = Boolean(backendHealth.autonomousLoopEnabled);
  const loopValue = autonomousLoopEnabled ? 'auto' : 'manual';
  const loopMode = autonomousLoopEnabled ? 'Backend loop active' : 'Manual override';
  const txLogEvents = state.liveProofBundle?.txEvents?.length ? state.liveProofBundle.txEvents : ledgerEvents;

  return (
    <div className="robot-cockpit grid gap-3 md:h-full md:min-h-0 md:overflow-hidden xl:grid-cols-[1.05fr_1.35fr_0.9fr]">
      <section className="robot-core-panel flex flex-col overflow-visible p-3 md:min-h-0 md:overflow-hidden">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/18 bg-cyan-300/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase text-cyan-100/80">
              <RadioTowerIcon className="h-3.5 w-3.5" />
              {mode}
            </div>
            <h3 className="text-2xl font-semibold tracking-tight text-white">Autonomous core</h3>
            <p className="mt-1 truncate font-mono text-xs text-white/44">{walletAddress}</p>
          </div>
          <div className="robot-orbit" aria-hidden="true"><BotIcon className="h-5 w-5" /></div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Metric label="TWAK" value={twakValidated ? 'valid' : server.walletBound ? 'check' : asText(server.state, 'dry')} />
          <Metric label="loop" value={loopValue} />
          <Metric label="trades" value={asText(state.ledger?.dailyCompliance?.progress ?? state.ledger?.dailyCompliance?.tradeCount ?? 0, '0')} />
          <Metric label="SDK" value={sdk.ready ? 'ready' : sdk.installed ? 'installed' : 'gap'} />
          <Metric label="x402" value={x402Value} />
          <Metric label="PnL" value={`${asText(state.ledger?.pnl?.totalReturnPct, '0')}%`} />
        </div>

        <div className="mt-2">
          <CompetitionReadinessStrip state={state} />
        </div>

        <div className="mt-2">
          <LivePreflightPanel preflight={state.livePreflight} />
        </div>

        <div className="mt-2">
          <LiveProofBundlePanel bundle={state.liveProofBundle} />
        </div>

        <div className="mt-3 grid gap-2">
          <div className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2">
            <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase text-white/42">
              <span>backend automation</span>
              <span className={autonomousLoopEnabled ? 'text-emerald-200' : 'text-amber-100'}>{loopMode}</span>
            </div>
          </div>
          <button type="button" onClick={runPipeline} disabled={pipelineRunning} className="robot-primary-action">
            {pipelineRunning ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <PlayCircleIcon className="h-4 w-4" />}
            {liveExecution ? 'Run live override' : 'Run dry override'}
          </button>
          <button type="button" onClick={togglePause} className="robot-secondary-action">
            <PauseCircleIcon className="h-4 w-4" />
            {paused ? 'Resume execution' : 'Pause execution'}
          </button>
        </div>

        {error ? <p className="mt-2 rounded-md border border-amber-300/20 bg-amber-300/10 px-2 py-1.5 text-xs text-amber-100">{error}</p> : null}
        <p className="mt-auto pt-3 font-mono text-[10px] uppercase text-white/32">snapshot {lastUpdated} / 3 MCP reads + health</p>
      </section>

      <section className="robot-core-panel flex flex-col overflow-visible p-3 md:min-h-0 md:overflow-hidden">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><BrainCircuitIcon className="h-4 w-4 text-bnb-gold" /> Work order rail</h3>
          <span className="rounded-sm border border-white/10 px-2 py-1 font-mono text-[10px] uppercase text-white/42">{lifecycle?.state ?? workOrders[0]?.state ?? 'idle'}</span>
        </div>
        <TradeProofScorePanel score={proofScore} />
        <TradeProofTimeline workOrders={workOrders} recovery={recovery} ledgerEvents={ledgerEvents} running={pipelineRunning || loading} />
      </section>

      <div className="grid gap-3 md:min-h-0 md:grid-rows-[0.72fr_0.82fr_0.95fr_1.05fr] md:overflow-hidden">
        <RecoveryCandidatePanel candidates={recovery} />
        <ProofReportSummary bundle={state.liveProofBundle} />
        <AgentReasoningPanel state={state} offline={offline} paused={paused} />
        <ChainTxLog events={txLogEvents} />
      </div>
    </div>
  );
}

export default BnbTradingAgentDashboard;
