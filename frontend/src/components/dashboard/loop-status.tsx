import { ActivityIcon, PlayIcon, SquareIcon } from 'lucide-react';
import { proofLabel, proofText } from './proof-labels';

type Payload = Record<string, any>;

export function LoopStatusPanel({
  loopStatus,
  actionStatus = '',
  actionBusy = false,
  onRunCycle,
  onStart,
  onStop,
}: {
  loopStatus?: Payload;
  actionStatus?: string;
  actionBusy?: boolean;
  onRunCycle?: () => void;
  onStart?: () => void;
  onStop?: () => void;
}) {
  const running = loopStatus?.running === true;
  const cycleCount = proofText(loopStatus?.cycleCount, '0');
  const intervalSec = proofText(loopStatus?.intervalSec, '60');
  const errorCount = proofText(loopStatus?.errorCount, '0');
  const lastError = proofText(loopStatus?.lastError, '');
  const lastCycleAt = proofText(loopStatus?.lastCycleAt, '');
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
        </div>
        {lastCycleAt && (
          <span className="loop-last-cycle">
            <small>Last cycle</small>
            <b>{String(lastCycleAt).slice(0, 19)}</b>
          </span>
        )}
        {lastError && (
          <span className="loop-error">
            <small>Last error</small>
            <b>{String(lastError).slice(0, 80)}</b>
          </span>
        )}
        <div className="loop-actions">
          <button type="button" onClick={onRunCycle} disabled={actionBusy} aria-label="Run Casper cycle">
            <PlayIcon className="h-3 w-3" />
            Run cycle
          </button>
          {running ? (
            <button type="button" onClick={onStop} disabled={actionBusy} aria-label="Stop Casper loop">
              <SquareIcon className="h-3 w-3" />
              Stop
            </button>
          ) : (
            <button type="button" onClick={onStart} disabled={actionBusy} aria-label="Start Casper loop">
              <PlayIcon className="h-3 w-3" />
              Start
            </button>
          )}
        </div>
        {actionStatus && <span className="loop-action-status" aria-live="polite">{proofLabel(actionStatus)}</span>}
      </div>
    </section>
  );
}

export default LoopStatusPanel;
