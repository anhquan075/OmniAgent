import { policyRows, type Payload } from './flight-deck-model';
import { proofLabel } from './proof-labels';

export default function PolicyGateSummary({ bundle }: { bundle?: Payload }) {
  const rows = policyRows(bundle);
  const status = proofLabel(bundle?.status, { stripCasperPrefix: true }) || 'pending';
  return (
    <section className="flight-panel policy-gate-summary" aria-label="Policy gates summary">
      <div className="flight-panel-head">
        <h2>Policy gates summary</h2>
        <span>{status}</span>
      </div>
      <div className="policy-grid">
        {rows.length ? rows.map(row => (
          <span key={row.key} className={policyClassName(row.status)}>
            <b>{row.label}</b>
            <small>
              {row.blocker
                ? proofLabel(row.blocker, { stripCasperPrefix: true })
                : row.status}
            </small>
          </span>
        )) : (
          <span className="is-blocked">
            <b>No policy checks</b>
            <small>Waiting for live snapshot</small>
          </span>
        )}
      </div>
    </section>
  );
}

function policyClassName(status: string) {
  if (status === 'pass') return 'is-ok';
  if (status === 'blocked') return 'is-blocked';
  return 'is-fail';
}
