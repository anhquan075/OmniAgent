export function AgentVerdictSummary({
  offline,
  paused,
  canExecute,
  riskPass,
  readyCount,
  total,
}: {
  offline: boolean;
  paused: boolean;
  canExecute: boolean;
  riskPass: boolean;
  readyCount: number;
  total: number;
}) {
  const title = offline ? "No trade can be sent" : paused ? "Agent live in safety hold" : canExecute ? "Ready when policy allows" : "Monitoring safety gates";
  const body = offline
    ? "The backend session is offline, so market data, wallet checks, and proof checks are treated as unavailable."
    : paused
      ? "Policy control is active, so the agent stays online while the trade path remains closed."
      : canExecute
        ? "The required checks are aligned; execution remains backend controlled."
        : riskPass
          ? "Risk checks passed, but execution still needs the remaining proof and wallet gates."
          : "The agent is live and checking market, policy, wallet, and proof gates.";

  return (
    <div className="reasoning-verdict-summary" aria-label="Reasoning summary">
      <span>{title}</span>
      <p>{body}</p>
      <b>{readyCount}/{total} ready</b>
    </div>
  );
}

export default AgentVerdictSummary;
