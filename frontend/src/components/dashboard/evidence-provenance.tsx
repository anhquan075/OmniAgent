import { ArrowRightIcon, CheckCircle2Icon, CircleDashedIcon } from 'lucide-react';

import { decisionFromBundle, hasX402Receipt, type Payload, type SourceState } from './flight-deck-model';
import { proofLabel, proofText } from './proof-labels';

const STEP_LABELS = ['Evidence', 'Proposer', 'Critic', 'Receipt', 'Readback'];

export default function EvidenceProvenance({
  bundle,
  x402,
  sourceState,
}: {
  bundle?: Payload;
  x402?: Payload;
  sourceState?: SourceState;
}) {
  const loading = sourceState === 'loading';
  const decision = decisionFromBundle(bundle);
  const roles = Array.isArray(decision.guardrails?.roles) ? decision.guardrails.roles.slice(0, 3) : [];
  const steps = [
    { label: 'Evidence', ok: Boolean(decision.evidenceBundle?.sourceHash) },
    { label: 'Proposer', ok: roles.some((role: Payload) => role.agentRole === 'proposer') },
    { label: 'Critic', ok: roles.some((role: Payload) => role.agentRole === 'critic') },
    { label: 'Receipt', ok: Boolean(decision.proofDigest) },
    { label: 'Readback', ok: bundle?.readback?.verified === true },
  ];
  const x402Proof = x402 ?? {};
  const x402Ready = hasX402Receipt(x402Proof);
  if (loading) {
    return (
      <section className="flight-panel evidence-provenance" aria-busy="true" aria-label="Loading evidence provenance">
        <div className="flight-panel-head">
          <h2>Evidence provenance</h2>
          <span>Loading…</span>
        </div>
        <ol aria-hidden="true">
          {STEP_LABELS.map((label) => (
            <li key={label} className="is-skeleton">
              <span className="skeleton-block packet-skeleton-cell is-chip" />
            </li>
          ))}
        </ol>
        <div className="x402-proof is-guarded" aria-hidden="true">
          <span className="skeleton-block packet-skeleton-cell" />
        </div>
      </section>
    );
  }
  return (
    <section className="flight-panel evidence-provenance">
      <div className="flight-panel-head">
        <h2>Evidence provenance</h2>
        <span>{proofLabel(decision.policyGate)}</span>
      </div>
      <ol>
        {steps.map((step, index) => (
          <li key={step.label} className={step.ok ? 'is-complete' : ''}>
            {step.ok ? <CheckCircle2Icon className="h-4 w-4" aria-hidden="true" /> : <CircleDashedIcon className="h-4 w-4" aria-hidden="true" />}
            <b>{step.label}</b>
            {index < steps.length - 1 ? <ArrowRightIcon className="h-3 w-3" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
      <div className={`x402-proof ${x402Ready ? 'is-ok' : 'is-guarded'}`} data-x402-status={x402Ready ? 'verified' : 'unavailable'}>
        <b>x402 settlement proof</b>
        <span>{x402Ready ? `Receipt ${proofText(x402Proof.receipt?.receiptHash)}` : 'Unavailable until public receipt metadata exists'}</span>
      </div>
    </section>
  );
}
