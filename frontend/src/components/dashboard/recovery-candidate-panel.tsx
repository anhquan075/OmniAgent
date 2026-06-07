import { RotateCcwIcon, ShieldCheckIcon } from "lucide-react";
import type { RecoveryCandidate } from "../../lib/dashboard-types";

export function RecoveryCandidatePanel({ candidates = [] }: { candidates?: RecoveryCandidate[] }) {
  const visibleCandidates = candidates.slice(0, 4);

  return (
    <section className="recovery-panel">
      <div className="recovery-head">
        <div>
          <span>Repair queue</span>
          <h3>
            <RotateCcwIcon className="h-4 w-4" />
            Recovery candidates
          </h3>
        </div>
        <b>{visibleCandidates.length ? `${visibleCandidates.length} open` : "clean"}</b>
      </div>
      <div className="recovery-list">
        {visibleCandidates.length ? visibleCandidates.map(candidate => (
          <div key={candidate.id} className="recovery-card">
            <div className="recovery-card-head">
              <strong>{candidate.label ?? candidate.type}</strong>
              <span>{candidate.safeNextAction}</span>
            </div>
            <p>{candidate.reason}</p>
          </div>
        )) : (
          <div className="recovery-empty">
            <ShieldCheckIcon className="h-4 w-4" />
            <strong>No recovery repair required</strong>
            <p>Proof path is clean. New repair candidates will appear here when a gate can be safely retried.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default RecoveryCandidatePanel;
