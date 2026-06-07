type Payload = Record<string, any>;

const text = (value: unknown, fallback = "pending") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

export function DecisionSummary({ state }: { state: Payload }) {
  const decision = state.cycle?.strategyDecision?.decision ?? {};
  return (
    <section className="quant-summary">
      <span>Decision summary</span>
      <strong>{text(decision.action, "NO TRADE").toUpperCase()}</strong>
      <p>{text(decision.rationale, "Observation only. No executable order is proposed until all proof and risk gates pass.")}</p>
    </section>
  );
}
