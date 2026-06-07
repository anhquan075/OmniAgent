import { RotateCcwIcon, ShieldCheckIcon } from "lucide-react";
import type { RecoveryCandidate } from "../../lib/dashboard-types";

export function RecoveryCandidatePanel({ candidates = [] }: { candidates?: RecoveryCandidate[] }) {
  return (
    <section className="robot-core-panel min-h-0 overflow-hidden p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
          <RotateCcwIcon className="h-4 w-4 text-bnb-amber" />
          Recovery candidates
        </h3>
        <span className="rounded-sm border border-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-white/42">
          read-only
        </span>
      </div>
      <div className="min-h-0 overflow-y-auto custom-scrollbar">
        {candidates.length ? candidates.slice(0, 4).map(candidate => (
          <div key={candidate.id} className="mb-1.5 rounded-md border border-bnb-amber/18 bg-bnb-amber/[0.045] p-1.5 last:mb-0">
            <div className="flex items-center justify-between gap-2">
              <strong className="truncate text-[11px] text-bnb-amber">{candidate.label ?? candidate.type}</strong>
              <span className="rounded-sm border border-white/10 px-1 py-0.5 font-mono text-[9px] text-white/42">
                {candidate.safeNextAction}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[10px] text-white/46">{candidate.reason}</p>
          </div>
        )) : (
          <div className="grid min-h-16 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-center">
            <div>
              <ShieldCheckIcon className="mx-auto mb-1 h-4 w-4 text-neon-green" />
              <p className="text-[11px] text-white/48">No recovery repair required.</p>
              <p className="mt-0.5 text-[10px] uppercase text-white/30">proof path clean</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default RecoveryCandidatePanel;
