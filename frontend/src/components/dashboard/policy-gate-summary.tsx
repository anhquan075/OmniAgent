import { LockIcon } from 'lucide-react';

import { policyRows, type Payload } from './flight-deck-model';
import { proofLabel } from './proof-labels';

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
          <span key={row.key} className={policyClassName(row.status)}>
            <b>{row.label}</b>
            <small>{row.blocker ? `${row.status}: ${proofLabel(row.blocker, { stripCasperPrefix: true })}` : row.status}</small>
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

function policyClassName(status: string) {
  if (status === 'pass') return 'is-ok';
  if (status === 'blocked') return 'is-blocked';
  return 'is-fail';
}
