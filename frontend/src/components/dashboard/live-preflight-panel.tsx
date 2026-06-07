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
  const panelTone = !hasPreflight
    ? "border-white/12 bg-white/[0.035]"
    : ready
      ? "border-neon-green/25 bg-neon-green/[0.055]"
      : "border-amber-300/20 bg-amber-300/[0.055]";
  return (
    <div className={`rounded-md border px-2 py-2 ${panelTone}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-white/52">
          {ready ? <ShieldCheckIcon className="h-3.5 w-3.5 text-neon-green" /> : <AlertTriangleIcon className={`h-3.5 w-3.5 ${hasPreflight ? "text-amber-200" : "text-white/42"}`} />}
          Live preflight
        </span>
        <strong className={`font-mono text-[10px] uppercase ${!hasPreflight ? "text-white/46" : ready ? "text-neon-green" : "text-amber-100"}`}>{status}</strong>
      </div>
      <div className="preflight-summary mb-1.5">
        <span>{hasPreflight ? `${blockers.length} blockers` : "waiting"}</span>
        <strong>{firstBlocker}</strong>
      </div>
      <div className="flex min-h-5 flex-wrap gap-1">
        {visibleBlockers.map((item: Payload) => (
          <span key={String(item.name)} className="rounded-sm border border-white/10 bg-black/18 px-1.5 py-0.5 font-mono text-[9px] text-white/58">
            {String(item.name)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default LivePreflightPanel;
