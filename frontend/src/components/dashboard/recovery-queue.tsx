import { AlertCircleIcon } from 'lucide-react';

import { trustRows } from './flight-deck-model';
import { proofLabel, proofText } from './proof-labels';
import type { Payload, SourceState } from './flight-deck-model';

export default function RecoveryQueue({ bundle, sourceState = 'live' }: { bundle?: Payload; sourceState?: SourceState }) {
  const recovery: Payload[] = Array.isArray(bundle?.recoveryCandidates) ? bundle.recoveryCandidates.slice(0, 4) : [];
  const loading = sourceState === 'loading';
  const unavailable = sourceState === 'fallback';
  const rows = trustRows(bundle);
  return (
    <section className="flight-panel recovery-queue">
      <div className="flight-panel-head">
        <h2>Recovery queue</h2>
        <span>{loading ? 'loading' : unavailable ? 'unavailable' : `${recovery.length} blockers`}</span>
      </div>
      <div className="recovery-list">
        {loading ? (
          <span>
            <b>Loading recovery state…</b>
            <small>Holding proof gates closed until the live snapshot arrives.</small>
          </span>
        ) : unavailable ? (
          <span>
            <b>Recovery state unavailable</b>
            <small>Snapshot unavailable; proof gates are not assumed clear.</small>
          </span>
        ) : recovery.length ? recovery.map(item => (
          <span key={proofText(item.blocker)}>
            <AlertCircleIcon className="h-4 w-4" />
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
      <div className="trust-mini-grid" aria-label="Receipt trust summary">
        {rows.map(row => (
          <span key={row.label}>
            <small>{row.label}</small>
            <b>{row.value}</b>
          </span>
        ))}
      </div>
    </section>
  );
}
