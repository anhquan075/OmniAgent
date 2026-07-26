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
  const live = sourceState === 'live';
  const liveSubmit = live && preflight.liveSubmitEnabled === true && blockers.length === 0;
  return (
    <header className="flight-status-strip" data-density={live ? 'full' : 'compact'}>
      <div className="flight-title">
        <small>Live instrument strip</small>
        <h1>{live ? 'Proof console armed' : 'Proof console standby'}</h1>
      </div>
      <StatusItem
        id="score"
        icon={ShieldCheckIcon}
        label="Proof score"
        value={sourceMetricLabel(sourceState, `${score.score ?? 0}/${score.total ?? 0}`)}
        tone={sourceState === 'loading' ? 'neutral' : score.hardBlocked ? 'warn' : 'ok'}
      />
      <StatusItem
        id="loop"
        icon={TimerIcon}
        label="Loop status"
        value={loop.running ? 'Running' : 'Stopped'}
        tone={loop.running ? 'ok' : 'warn'}
        sub={loop.intervalSec ? `Every ${loop.intervalSec}s` : undefined}
      />
      {live ? (
        <StatusItem
          id="health"
          icon={ServerIcon}
          label="Backend health"
          value={proofLabel(health?.status, { stripCasperPrefix: true })}
          tone={health?.status === 'ok' ? 'ok' : 'warn'}
        />
      ) : null}
      {live ? (
        <StatusItem
          id="network"
          icon={WifiIcon}
          label="Network"
          value={proofText(runtime?.network ?? health?.network, 'casper')}
          sub={proofText(runtime?.account?.explorerUrl, '')}
        />
      ) : null}
      {live ? (
        <div
          className={`live-submit-guard ${liveSubmit ? 'is-live' : 'is-guarded'}`}
          data-live-submit-status={liveSubmit ? 'enabled' : 'guarded'}
        >
          <LockIcon className="h-4 w-4" aria-hidden="true" />
          <span>
            <small>Live submit</small>
            <b>{liveSubmit ? 'Enabled' : 'Guarded'}</b>
          </span>
        </div>
      ) : null}
      <button type="button" className="flight-refresh" onClick={onRefresh} aria-label="Refresh Casper snapshot">
        <RefreshCwIcon className={`h-4 w-4 ${loading ? 'is-spinning' : ''}`} aria-hidden="true" />
      </button>
    </header>
  );
}

function StatusItem({ id, icon: Icon, label, value, sub, tone = 'neutral' }: {
  id: string;
  icon: typeof ShieldCheckIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: 'ok' | 'warn' | 'neutral';
}) {
  return (
    <div className={`flight-status-item is-${tone}`} data-strip-item={id}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>
        <small>{label}</small>
        <b>{value}</b>
        {sub ? <em>{sub}</em> : null}
      </span>
    </div>
  );
}
