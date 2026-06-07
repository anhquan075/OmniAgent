import { AlertTriangleIcon, CheckCircle2Icon, CircleDashedIcon, ShieldAlertIcon } from "lucide-react";
import type { TradeProofScore } from "../../lib/dashboard-types";

const labelFor = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase());

export function TradeProofScorePanel({ score }: { score?: TradeProofScore }) {
  const hasScore = Boolean(score);
  const blockers = Array.isArray(score?.hardBlockers) ? score.hardBlockers : [];
  const checks = score?.checks ?? {};
  const hardBlocked = hasScore && Boolean(score?.hardBlocked || blockers.length);
  const checkEntries = Object.entries(checks).slice(0, 8);
  const passedChecks = checkEntries.filter(([, ok]) => ok).length;
  const scorePct = score?.maxScore ? Math.max(0, Math.min(100, Math.round((score.score / score.maxScore) * 100))) : 0;
  const panelTone = !hasScore ? "is-waiting" : hardBlocked ? "is-blocked" : "is-clear";

  return (
    <section className={`proof-score-panel ${panelTone}`}>
      <div className="proof-score-head">
        <span>
          {!hasScore ? <CircleDashedIcon className="h-3.5 w-3.5" /> : hardBlocked ? <ShieldAlertIcon className="h-3.5 w-3.5" /> : <CheckCircle2Icon className="h-3.5 w-3.5" />}
          Proof score
        </span>
        <strong>{score ? `${score.score}/${score.maxScore}` : "waiting"}</strong>
      </div>

      <div className="proof-score-meter" aria-label={`Proof score ${scorePct}%`}>
        <span style={{ width: `${scorePct}%` }} />
      </div>

      <div className="proof-score-summary">
        <span>{hasScore ? `${blockers.length} blockers` : "waiting"}</span>
        <span>{passedChecks}/{checkEntries.length || 8} gates</span>
        <span>{!hasScore ? "no score" : hardBlocked ? "hard stop" : "explainable"}</span>
      </div>

      <div className="proof-blocker-box">
        <div>
          <AlertTriangleIcon className="h-3 w-3" />
          Blocking checks
        </div>
        {!hasScore ? (
          <p>Waiting for the current proof bundle.</p>
        ) : blockers.length ? (
          <div className="proof-blocker-list">
            {blockers.slice(0, 4).map(blocker => (
              <span key={blocker}>{blocker}</span>
            ))}
          </div>
        ) : (
          <p>No hard blocker detected in the current proof bundle.</p>
        )}
      </div>

      <div className="proof-check-grid">
        {checkEntries.map(([key, ok]) => (
          <div key={key} className={ok ? "is-ready" : ""}>
            <span>{labelFor(key)}</span>
            <strong>{ok ? "yes" : "no"}</strong>
          </div>
        ))}
      </div>

      <p className="proof-score-note">Score explains evidence only; blocking checks still control live readiness.</p>
    </section>
  );
}

export default TradeProofScorePanel;
