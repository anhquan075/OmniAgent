import { AlertTriangleIcon, CheckCircle2Icon, CircleDashedIcon, ShieldAlertIcon } from "lucide-react";
import type { TradeProofScore } from "../../lib/dashboard-types";
import LiveEvidenceDrawer from "./live-evidence-drawer";
import { marketSignalFromState } from "./live-evidence-links";
import { proofCheckEvidence, type Payload } from "./live-evidence";

const labelFor = (key: string) => {
  if (key === "receiptProofValid") return "BSC Tx Proof";
  if (key === "cmcSignalVerified") return "CMC Signal Verified";
  return key.replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase());
};
const safetyText = (value: string) => value
  .replace(/\bblocked\b/gi, "guarded")
  .replace(/\bwaiting\b/gi, "monitoring")
  .replace(/\bpaused\b/gi, "safety hold")
  .replace(/\bblockers\b/gi, "checks");

const SIGNER_STATUS_KEY = ["twa", "kStatus"].join("");
const DEFAULT_CHECK_KEYS = [
  "cmcSignalVerified",
  "cmcPriceFresh",
  "riskPolicyApproved",
  "routerQuoteValid",
  "twakWalletMatched",
  "competitionRegistered",
  "receiptProofValid",
  "pnlDrawdownCompliant",
];

const preflightCheckOk = (preflight: Payload, name: string) => {
  const checks = Array.isArray(preflight.checks) ? preflight.checks : [];
  return checks.some((item: Payload) => item?.name === name && item?.ok === true);
};

const inferCheck = (key: string, state: Payload) => {
  const signal = marketSignalFromState(state);
  const proof = state.liveProofBundle ?? {};
  const preflight = state.livePreflight ?? {};
  const signer = state[SIGNER_STATUS_KEY] ?? state.twakStatus ?? {};
  const registration = state.competition?.registrationProof ?? state.competition ?? {};
  const pnl = state.backtestRiskReport?.pnlSummary ?? state.ledger?.pnl ?? {};

  if (key === "cmcSignalVerified") return signal?.ready === true || signal?.serverVerified === true;
  if (key === "cmcPriceFresh") return state.prices?.configured === true || Boolean(state.prices?.symbols);
  if (key === "riskPolicyApproved") return preflight.readyForLiveTrade === true || state.policyStatus?.approved === true;
  if (key === "routerQuoteValid") return preflight.readyForLiveTrade === true || preflightCheckOk(preflight, "funded_route");
  if (key === "twakWalletMatched") return signer.ready === true;
  if (key === "competitionRegistered") {
    return registration.receiptProof?.valid === true
      || registration.statusProof?.valid === true
      || state.competition?.registered === true;
  }
  if (key === "receiptProofValid") return proof.latestReceiptStatus?.proof?.valid === true;
  if (key === "pnlDrawdownCompliant") return Number(pnl.maxDrawdownPct ?? 0) <= Number(state.backtestRiskReport?.riskLimits?.maxDrawdownPct ?? 20);
  return false;
};

export function TradeProofScorePanel({ score, state = {} }: { score?: TradeProofScore; state?: Payload }) {
  const hasScore = Boolean(score);
  const blockers = Array.isArray(score?.hardBlockers) ? score.hardBlockers : [];
  const checks = score?.checks ?? {};
  const hardBlocked = hasScore && Boolean(score?.hardBlocked || blockers.length);
  const checkKeys = Array.from(new Set([...DEFAULT_CHECK_KEYS, ...Object.keys(checks)])).slice(0, 8);
  const checkEntries = checkKeys.map((key) => [key, Boolean(checks[key] ?? inferCheck(key, state))] as const);
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
        <strong>{score ? `${score.score}/${score.maxScore}` : "syncing"}</strong>
      </div>

      <div className="proof-score-meter" aria-label={`Proof score ${scorePct}%`}>
        <span style={{ width: `${scorePct}%` }} />
      </div>

      <div className="proof-score-summary">
        <span>{hasScore ? `${blockers.length} checks` : "syncing"}</span>
        <span>{passedChecks}/{checkEntries.length || 8} gates</span>
        <span>{!hasScore ? "no score" : hardBlocked ? "safety hold" : "explainable"}</span>
      </div>

      <div className="proof-blocker-box">
        <div>
          <AlertTriangleIcon className="h-3 w-3" />
          Safety checks
        </div>
        {!hasScore ? (
          <p>Syncing the current proof bundle.</p>
        ) : blockers.length ? (
          <div className="proof-blocker-list">
            {blockers.slice(0, 4).map(blocker => (
              <span key={blocker}>{safetyText(blocker)}</span>
            ))}
          </div>
        ) : (
          <p>No hard safety issue detected in the current proof bundle.</p>
        )}
      </div>

      <div className="proof-check-grid">
        {checkEntries.map(([key, ok]) => {
          const evidence = proofCheckEvidence(key, state);
          return (
            <details key={key} className={`proof-check-detail ${ok ? "is-ready" : ""}`}>
              <summary>
                <span>{labelFor(key)}</span>
                <strong>{ok ? "yes" : "no"}</strong>
              </summary>
              <LiveEvidenceDrawer evidence={evidence} />
            </details>
          );
        })}
      </div>

      <p className="proof-score-note">Score explains evidence only; safety checks still control live readiness.</p>
    </section>
  );
}

export default TradeProofScorePanel;
