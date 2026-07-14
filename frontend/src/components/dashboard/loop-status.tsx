import { ActivityIcon, CheckCircle2Icon, ClockIcon, PlayIcon, SquareIcon } from 'lucide-react';
import { proofLabel, proofText } from './proof-labels';

type Payload = Record<string, any>;

export function LoopStatusPanel({
  loopStatus,
}: {
  loopStatus?: Payload;
}) {
  const running = loopStatus?.running === true;
  const cycleCount = proofText(loopStatus?.cycleCount, '0');
  const intervalSec = proofText(loopStatus?.intervalSec, '60');
  const errorCount = proofText(loopStatus?.errorCount, '0');
  const lastError = proofText(loopStatus?.lastError, '');
  const lastCycleAt = proofText(loopStatus?.lastCycleAt, '');
  const nextCycleAt = proofText(loopStatus?.nextCycleAt, '');
  const lastDeployStatus = proofText(loopStatus?.lastDeployStatus, 'pending');
  const lastReadbackVerified = loopStatus?.lastReadbackVerified === true;
  const lastDeployHash = proofText(loopStatus?.lastDeployHash, '');
  const dryRun = loopStatus?.dryRun !== false;

  return (
    <section className="ops-section bento-card loop-status-panel" aria-label="Agent loop status">
      <div className="panel-head">
        <ActivityIcon className="h-4 w-4" />
        <h3>Agent loop</h3>
      </div>
      <div className="loop-status-content" data-loop-status>
        <span className={`loop-badge ${running ? 'is-running' : 'is-stopped'}`}>
          {running ? <PlayIcon className="h-3 w-3" /> : <SquareIcon className="h-3 w-3" />}
          {running ? 'running' : 'stopped'}
        </span>
        <div className="loop-stats">
          <span className="loop-stat">
            <small>Cycles</small>
            <b>{cycleCount}</b>
          </span>
          <span className="loop-stat">
            <small>Interval</small>
            <b>{intervalSec}s</b>
          </span>
          <span className="loop-stat">
            <small>Errors</small>
            <b className={Number(errorCount) > 0 ? 'is-blocked' : ''}>{errorCount}</b>
          </span>
          <span className="loop-stat">
            <small>Mode</small>
            <b>{dryRun ? 'dry-run' : 'live'}</b>
          </span>
          <span className="loop-stat">
            <small>Deploy</small>
            <b>{proofLabel(lastDeployStatus, { stripCasperPrefix: true })}</b>
          </span>
          <span className="loop-stat">
            <small>Readback</small>
            <b className={lastReadbackVerified ? 'is-ok' : 'is-blocked'}>
              {lastReadbackVerified ? 'verified' : 'waiting'}
            </b>
          </span>
        </div>
        <div className="loop-automation-note">
          {running ? <CheckCircle2Icon className="h-3 w-3" /> : <ClockIcon className="h-3 w-3" />}
          <span>{running ? 'Backend-owned automatic execution' : 'Backend automation paused'}</span>
        </div>
        {lastCycleAt && (
          <span className="loop-last-cycle">
            <small>Last cycle</small>
            <b>{String(lastCycleAt).slice(0, 19)}</b>
          </span>
        )}
        {nextCycleAt && (
          <span className="loop-last-cycle">
            <small>Next cycle</small>
            <b>{String(nextCycleAt).slice(0, 19)}</b>
          </span>
        )}
        {lastDeployHash && (
          <span className="loop-last-cycle">
            <small>Last deploy</small>
            <b>{String(lastDeployHash).slice(0, 18)}…</b>
          </span>
        )}
        {lastError && (
          <span className="loop-error">
            <small>Last error</small>
            <b>{String(lastError).slice(0, 80)}</b>
          </span>
        )}
      </div>
    </section>
  );
}

export default LoopStatusPanel;
