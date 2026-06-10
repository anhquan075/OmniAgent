type Payload = Record<string, any>;

const text = (value: unknown, fallback = "pending") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

const timeOnly = (value: unknown) => {
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "syncing";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

export function AutonomousLoopPulse({
  state,
  offline,
  statusLabel,
  copy,
}: {
  state: Payload;
  offline: boolean;
  statusLabel: string;
  copy: string;
}) {
  const loop = state.backendHealth?.autonomousLoop ?? {};
  const enabled = loop.enabled === true || state.backendHealth?.autonomousLoopEnabled === true;
  const dryRun = loop.execute === false;
  const running = enabled && !offline;
  const phase = offline ? "offline" : text(loop.phase ?? loop.state, running ? "monitoring" : "guarded");
  const mode = offline ? "reconnect" : dryRun ? "dry run" : text(loop.mode, "execute");
  const cadence = Number(loop.intervalSec);
  const cadenceLabel = Number.isFinite(cadence) && cadence > 0 ? `${Math.round(cadence / 60)}m` : "live";
  const nextRun = timeOnly(loop.nextRunAt);
  const lastRun = timeOnly(loop.lastRunAt);
  const className = [
    "autonomous-loop-pulse",
    running ? "is-running" : "is-idle",
    dryRun ? "is-dry-run" : "",
    offline ? "is-offline" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <div className="autonomous-loop-orbit" aria-hidden="true">
        <span className="loop-core" />
        {["sense", "decide", "sign", "prove"].map((step, index) => (
          <i key={step} className={`loop-node loop-node-${index + 1}`}>{step}</i>
        ))}
      </div>
      <div className="autonomous-loop-copy">
        <span>Autonomous loop</span>
        <strong>{statusLabel}</strong>
        <p>{copy}</p>
        <div aria-label="Autonomous loop timing">
          <small><b>{phase}</b> phase</small>
          <small><b>{mode}</b> mode</small>
          <small><b>{nextRun}</b> next</small>
          <small><b>{lastRun}</b> last</small>
          <small><b>{cadenceLabel}</b> cadence</small>
        </div>
      </div>
    </div>
  );
}

export default AutonomousLoopPulse;
