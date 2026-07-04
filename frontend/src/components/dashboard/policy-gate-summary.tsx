import { LockIcon } from 'lucide-react';

import { policyRows, type Payload } from './flight-deck-model';

export default function PolicyGateSummary({ bundle }: { bundle?: Payload }) {
  const rows = policyRows(bundle);
  return (
    <section className="flight-panel policy-gate-summary">
      <div className="flight-panel-head">
        <h2>Policy gates summary</h2>
        <span>{bundle?.status ?? 'pending'}</span>
      </div>
      <div className="policy-grid">
        {rows.length ? rows.map(row => (
          <span key={row.key} className={row.status === 'pass' ? 'is-ok' : 'is-blocked'}>
            <b>{row.label}</b>
            <small>{row.status}</small>
          </span>
        )) : (
          <span className="is-blocked">
            <b>No policy checks</b>
            <small>pending</small>
          </span>
        )}
      </div>
      <p><LockIcon className="h-4 w-4" /> Overall policy state: {bundle?.status ?? 'pending'}</p>
    </section>
  );
}
