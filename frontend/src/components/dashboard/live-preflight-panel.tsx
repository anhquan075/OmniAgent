import { AlertTriangleIcon, ShieldCheckIcon } from "lucide-react";

type Payload = Record<string, any>;

export function LivePreflightPanel({ preflight }: { preflight?: Payload }) {
  const hasPreflight = Boolean(preflight);
  const blockers = Array.isArray(preflight?.blockers) ? preflight.blockers : [];
  const ready = hasPreflight && Boolean(preflight?.readyForLiveTrade);
  const enableReady = hasPreflight && Boolean(preflight?.readyToEnableLive);
  const status = !hasPreflight ? "Waiting" : ready ? "Live-ready" : enableReady ? "Enable-ready" : "Blocked";
  const visibleBlockers = !hasPreflight
    ? [{ name: "preflight snapshot", ok: false }]
    : blockers.length
      ? blockers.slice(0, 4)
      : [{ name: "all gates", ok: true }];
  const firstBlocker = !hasPreflight ? "waiting for snapshot" : blockers[0]?.name ? String(blockers[0].name) : ready ? "none" : "waiting for proof";
  const panelTone = !hasPreflight ? "is-waiting" : ready ? "is-ready" : "is-blocked";

  return (
    <section className={`live-preflight-panel ${panelTone}`}>
      <div className="live-preflight-head">
        <span>
          {ready ? <ShieldCheckIcon className="h-3.5 w-3.5" /> : <AlertTriangleIcon className="h-3.5 w-3.5" />}
          Live preflight
        </span>
        <strong>{status}</strong>
      </div>
      <div className="preflight-summary">
        <span>{hasPreflight ? `${blockers.length} blockers` : "waiting"}</span>
        <strong>{firstBlocker}</strong>
      </div>
      <div className="preflight-chip-list">
        {visibleBlockers.map((item: Payload) => (
          <span key={String(item.name)} className={item.ok ? "is-ready" : ""}>
            {String(item.name)}
          </span>
        ))}
      </div>
    </section>
  );
}

export default LivePreflightPanel;
