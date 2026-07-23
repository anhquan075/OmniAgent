import { LockIcon, RefreshCwIcon, ServerIcon, ShieldCheckIcon, TimerIcon, WifiIcon } from 'lucide-react';

import { proofLabel, proofText } from './proof-labels';
import { sourceMetricLabel, type Payload, type SourceState } from './flight-deck-model';

export default function FlightDeckStatusStrip({
  runtime,
  bundle,
  health,
  sourceState,
  loading,
  onRefresh,
}: {
  runtime?: Payload;
  bundle?: Payload;
  health?: Payload;
  sourceState: SourceState;
  loading?: boolean;
  onRefresh: () => void;
}) {
  const score = bundle?.proofScore ?? {};
  const loop = runtime?.loopStatus ?? {};
  const preflight = bundle?.preflight ?? runtime?.preflight ?? {};
  const blockers = Array.isArray(preflight.hardBlockers) ? preflight.hardBlockers : [];
  const liveSubmit = sourceState === 'live' && preflight.liveSubmitEnabled === true && blockers.length === 0;
  return (
    <header className="flight-status-strip">
      <div className="flight-title">
        <small>Receipt Flight Deck</small>
        <h1>Casper proof console</h1>
      </div>
      <StatusItem icon={ShieldCheckIcon} label="Proof score" value={sourceMetricLabel(sourceState, `${score.score ?? 0}/${score.total ?? 0}`)} tone={sourceState === 'loading' ? 'neutral' : score.hardBlocked ? 'warn' : 'ok'} />
      <StatusItem icon={ServerIcon} label="Backend health" value={sourceMetricLabel(sourceState, proofLabel(health?.status, { stripCasperPrefix: true }))} tone={health?.status === 'ok' && sourceState === 'live' ? 'ok' : sourceState === 'loading' ? 'neutral' : 'warn'} />
      <StatusItem icon={TimerIcon} label="Loop status" value={loop.running ? 'Running' : 'Stopped'} tone={loop.running ? 'ok' : 'warn'} sub={loop.intervalSec ? `Every ${loop.intervalSec}s` : undefined} />
      <StatusItem icon={WifiIcon} label="Network" value={proofText(runtime?.network ?? health?.network, 'casper')} sub={proofText(runtime?.account?.explorerUrl, '')} />
      <div className={`live-submit-guard ${liveSubmit ? 'is-live' : 'is-guarded'}`} data-live-submit-status={liveSubmit ? 'enabled' : 'guarded'}>
        <LockIcon className="h-4 w-4" />
        <span>
          <small>Live submit</small>
          <b>{liveSubmit ? 'Enabled' : 'Guarded'}</b>
        </span>
      </div>
      <button type="button" className="flight-refresh" onClick={onRefresh} aria-label="Refresh Casper snapshot">
        <RefreshCwIcon className={`h-4 w-4 ${loading ? 'is-spinning' : ''}`} />
      </button>
    </header>
  );
}

function StatusItem({ icon: Icon, label, value, sub, tone = 'neutral' }: {
  icon: typeof ShieldCheckIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: 'ok' | 'warn' | 'neutral';
}) {
  return (
    <div className={`flight-status-item is-${tone}`}>
      <Icon className="h-4 w-4" />
      <span>
        <small>{label}</small>
        <b>{value}</b>
        {sub ? <em>{sub}</em> : null}
      </span>
    </div>
  );
}
