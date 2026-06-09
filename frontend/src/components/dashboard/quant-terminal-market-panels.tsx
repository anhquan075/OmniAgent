type Payload = Record<string, any>;

const text = (value: unknown, fallback = "pending") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

const liveText = (value: unknown, fallback: string) => text(value, fallback)
  .replace(/\bblocked\b/gi, "guarded")
  .replace(/\bwaiting\b/gi, "monitoring")
  .replace(/\bpaused\b/gi, "safety hold")
  .replace(/\bblockers\b/gi, "checks");

export function DecisionSummary({ state }: { state: Payload }) {
  const decision = state.cycle?.strategyDecision?.decision ?? {};
  const confidence = Number(decision.confidence);
  const confidenceLabel = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : "scanning";
  const source = text(state.cycle?.strategyDecision?.source, "policy");
  const blockers = state.liveProofBundle?.proofScore?.hardBlockers ?? state.workOrders?.proofScore?.hardBlockers ?? [];
  const riskLabel = Array.isArray(blockers) && blockers.length ? `${blockers.length} checks` : "managed";

  return (
    <section className="quant-summary quant-primary-verdict" aria-label="Primary decision verdict">
      <span>Decision summary</span>
      <strong>{text(decision.action, "MONITORING").toUpperCase()}</strong>
      <div className="quant-decision-meta" aria-label="Decision metadata">
        <span><small>Confidence</small><b>{confidenceLabel}</b></span>
        <span><small>Source</small><b>{source}</b></span>
        <span><small>Risk</small><b>{riskLabel}</b></span>
      </div>
      <p>{liveText(decision.rationale, "24/7 monitor mode. Executable orders require proof and risk gates.")}</p>
    </section>
  );
}
