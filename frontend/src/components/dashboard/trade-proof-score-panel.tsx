import { AlertTriangleIcon, CheckCircle2Icon, ShieldAlertIcon } from "lucide-react";
import type { TradeProofScore } from "../../lib/mcp";

const labelFor = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase());

export function TradeProofScorePanel({ score }: { score?: TradeProofScore }) {
  const blockers = Array.isArray(score?.hardBlockers) ? score.hardBlockers : [];
  const checks = score?.checks ?? {};
  const hardBlocked = Boolean(score?.hardBlocked || blockers.length);

  return (
    <div className={`rounded-md border p-2 ${hardBlocked ? "border-red-300/24 bg-red-300/[0.055]" : "border-neon-green/25 bg-neon-green/[0.04]"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-white/58">
          {hardBlocked ? <ShieldAlertIcon className="h-3.5 w-3.5 text-red-200" /> : <CheckCircle2Icon className="h-3.5 w-3.5 text-neon-green" />}
          Proof score
        </span>
        <strong className={`font-mono text-[10px] uppercase ${hardBlocked ? "text-red-100" : "text-neon-green"}`}>
          {score ? `${score.score}/${score.maxScore}` : "waiting"}
        </strong>
      </div>

      <div className="mb-2 rounded-sm border border-white/10 bg-black/18 p-1.5">
        <div className="mb-1 flex items-center gap-1.5 text-[9px] font-semibold uppercase text-white/42">
          <AlertTriangleIcon className="h-3 w-3" />
          Hard blockers first
        </div>
        {blockers.length ? (
          <div className="flex flex-wrap gap-1">
            {blockers.slice(0, 4).map(blocker => (
              <span key={blocker} className="rounded-sm border border-red-200/20 bg-red-300/10 px-1.5 py-0.5 font-mono text-[9px] text-red-100">
                {blocker}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-white/46">No hard blocker detected in the current proof bundle.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1">
        {Object.entries(checks).slice(0, 8).map(([key, ok]) => (
          <div key={key} className="flex min-w-0 items-center justify-between gap-1 rounded-sm bg-white/[0.035] px-1.5 py-1">
            <span className="truncate text-[9px] text-white/40">{labelFor(key)}</span>
            <strong className={`font-mono text-[9px] ${ok ? "text-neon-green" : "text-white/34"}`}>{ok ? "yes" : "no"}</strong>
          </div>
        ))}
      </div>

      <p className="mt-1.5 text-[10px] text-white/38">Score explains evidence only; hard blockers still control live readiness.</p>
    </div>
  );
}

export default TradeProofScorePanel;
