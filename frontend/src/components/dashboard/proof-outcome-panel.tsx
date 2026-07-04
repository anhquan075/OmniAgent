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
  const Icon = verified ? BadgeCheckIcon : ShieldAlertIcon;
  return (
    <section className={`flight-panel proof-outcome-panel ${verified ? 'is-verified' : 'is-guarded'}`} aria-label="RWA collateral outcome">
      <div className="proof-outcome-title">
        <Icon className="h-5 w-5" />
        <div>
          <small>RWA collateral outcome</small>
          <h2>{sourceState === 'live' ? outcome.action : 'Snapshot unavailable'}</h2>
        </div>
      </div>
      <div className="proof-outcome-grid">
        <span><small>Risk</small><b>{outcome.riskScore}</b></span>
        <span><small>Policy</small><b>{outcome.policyGate}</b></span>
        <span><small>Proof</small><b>{outcome.proofStatus}</b></span>
        <span><small>Readback</small><b>{outcome.readback}</b></span>
        <span><small>Template</small><b>{outcome.template}</b></span>
        <span><small>Paid evidence</small><b>{outcome.paidEvidence}</b></span>
        <span className="proof-outcome-hash"><small>Evidence graph</small><b>{shortValue(outcome.evidenceGraph)}</b></span>
      </div>
    </section>
  );
}
