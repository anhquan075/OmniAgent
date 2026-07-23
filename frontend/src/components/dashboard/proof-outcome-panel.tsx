import { BadgeCheckIcon, ShieldAlertIcon } from 'lucide-react';

import { outcomeSummary, shortValue, type Payload, type SourceState } from './flight-deck-model';

export default function ProofOutcomePanel({
  bundle,
  sourceState,
}: {
  bundle?: Payload;
  sourceState: SourceState;
}) {
  const outcome = outcomeSummary(bundle);
  const verified = sourceState === 'live' && outcome.readback === 'verified';
  const loading = sourceState === 'loading';
  const Icon = verified ? BadgeCheckIcon : ShieldAlertIcon;
  const headline = sourceState === 'live'
    ? outcome.action
    : loading
      ? 'Loading snapshot…'
      : 'Snapshot unavailable';
  return (
    <section
      className={`flight-panel proof-outcome-panel ${verified ? 'is-verified' : 'is-guarded'} ${loading ? 'is-loading' : ''}`}
      aria-label="RWA collateral outcome"
      aria-busy={loading || undefined}
    >
      <div className="proof-outcome-title">
        <Icon className="h-5 w-5" />
        <div>
          <small>RWA collateral outcome</small>
          <h2>{headline}</h2>
        </div>
      </div>
      <div className="proof-outcome-metrics">
        <div className="proof-outcome-grid">
          {loading ? (
            <>
              <span className="skeleton-block" aria-hidden="true" />
              <span className="skeleton-block" aria-hidden="true" />
              <span className="skeleton-block" aria-hidden="true" />
              <span className="skeleton-block" aria-hidden="true" />
              <span className="skeleton-block" aria-hidden="true" />
            </>
          ) : (
            <>
              <span><small>Risk</small><b>{outcome.riskScore}</b></span>
              <span><small>Policy</small><b>{outcome.policyGate}</b></span>
              <span><small>Proof</small><b>{outcome.proofStatus}</b></span>
              <span><small>Readback</small><b>{outcome.readback}</b></span>
              <span><small>Paid evidence</small><b>{outcome.paidEvidence}</b></span>
            </>
          )}
        </div>
        <div className="proof-outcome-secondary">
          {loading ? (
            <>
              <span className="skeleton-block" aria-hidden="true" />
              <span className="skeleton-block proof-outcome-hash" aria-hidden="true" />
            </>
          ) : (
            <>
              <span><small>Template</small><b>{outcome.template}</b></span>
              <span className="proof-outcome-hash"><small>Evidence graph</small><b>{shortValue(outcome.evidenceGraph)}</b></span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
