type Payload = Record<string, any>;

const text = (value: unknown, fallback = "pending") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

export function DecisionSummary({ state }: { state: Payload }) {
  const decision = state.cycle?.strategyDecision?.decision ?? {};
  const confidence = Number(decision.confidence);
  const confidenceLabel = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : "waiting";
  const source = text(state.cycle?.strategyDecision?.source, "read-only");
  const blockers = state.liveProofBundle?.proofScore?.hardBlockers ?? state.workOrders?.proofScore?.hardBlockers ?? [];
  const riskLabel = Array.isArray(blockers) && blockers.length ? `${blockers.length} blockers` : "guarded";

  return (
    <section className="quant-summary quant-primary-verdict" aria-label="Primary decision verdict">
      <span>Decision summary</span>
      <strong>{text(decision.action, "NO TRADE").toUpperCase()}</strong>
      <div className="quant-decision-meta" aria-label="Decision metadata">
        <span><small>Confidence</small><b>{confidenceLabel}</b></span>
        <span><small>Source</small><b>{source}</b></span>
        <span><small>Risk</small><b>{riskLabel}</b></span>
      </div>
      <p>{text(decision.rationale, "Read-only mode. No executable order is proposed until all proof and risk gates pass.")}</p>
    </section>
  );
}
