import { AlertTriangleIcon, ShieldCheckIcon } from "lucide-react";

type Payload = Record<string, any>;

const safetyText = (value: unknown) => String(value)
  .replace(/\bblocked\b/gi, "guarded")
  .replace(/\bwaiting\b/gi, "monitoring")
  .replace(/\bpaused\b/gi, "safety hold")
  .replace(/\bblockers\b/gi, "checks");

export function LivePreflightPanel({ preflight }: { preflight?: Payload }) {
  const hasPreflight = Boolean(preflight);
  const blockers = Array.isArray(preflight?.blockers) ? preflight.blockers : [];
  const ready = hasPreflight && Boolean(preflight?.readyForLiveTrade);
  const enableReady = hasPreflight && Boolean(preflight?.readyToEnableLive);
  const status = !hasPreflight ? "Syncing" : ready ? "Ready" : enableReady ? "Can enable" : "Guarded";
  const visibleBlockers = !hasPreflight
    ? [{ name: "safety snapshot", ok: false }]
    : blockers.length
      ? blockers.slice(0, 4)
      : [{ name: "all checks", ok: true }];
  const firstBlocker = !hasPreflight ? "safety snapshot sync" : blockers[0]?.name ? safetyText(blockers[0].name) : ready ? "none" : "proof sync";
  const panelTone = !hasPreflight ? "is-waiting" : ready ? "is-ready" : "is-blocked";

  return (
    <section className={`live-preflight-panel ${panelTone}`}>
      <div className="live-preflight-head">
        <span>
          {ready ? <ShieldCheckIcon className="h-3.5 w-3.5" /> : <AlertTriangleIcon className="h-3.5 w-3.5" />}
          Live safety check
        </span>
        <strong>{status}</strong>
      </div>
      <div className="preflight-summary">
        <span>{hasPreflight ? `${blockers.length} checks` : "syncing"}</span>
        <strong>{firstBlocker}</strong>
      </div>
      <div className="preflight-chip-list">
        {visibleBlockers.map((item: Payload) => (
          <span key={String(item.name)} className={item.ok ? "is-ready" : ""}>
            {safetyText(item.name)}
          </span>
        ))}
      </div>
    </section>
  );
}

export default LivePreflightPanel;
