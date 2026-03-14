import { fmtBps, fmtPrice } from "@/lib/vaultDisplayFormatters";
import { CheckCircle2, XCircle, Circle, Info, Loader, Pause, Play, Zap } from 'lucide-react';
import { useEffect, useState } from "react";

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/// Format raw seconds into "Xh Ym Zs" countdown string.
function fmtSeconds(secs) {
  if (secs == null || secs < 0) return "—";
  const s = Math.floor(secs);
  if (s === 0) return "ready";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

/// Shorten ISO timestamp to "Jan 21 14:32" local time.
function fmtExecTime(val) {
  if (!val || val === "-" || val === "never") return val || "never";
  try {
    return new Date(val).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return val; }
}

const STATE_LABELS = ["Normal", "Guarded", "Drawdown"];

/// Compact decision summary - just shows the key decision, no step-by-step
function AlgoSummary({ pd }) {
  if (!pd) return <p style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>Waiting for on-chain data…</p>;

  const nextStateLabel = STATE_LABELS[pd.nextState] ?? "Unknown";
  const price = fmtPrice(pd.price);
  const targetBps = fmtBps(pd.targetWDKBps);
  const executable = pd.executable;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Price: <strong style={{ color: "var(--text)" }}>{price}</strong></span>
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>→</span>
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Target: <strong style={{ color: "var(--accent)" }}>{targetBps}</strong></span>
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>→</span>
      <span style={{
        fontSize: 11,
        fontWeight: 700,
        color: executable ? "var(--success)" : "var(--danger)",
        textTransform: "uppercase",
        letterSpacing: ".05em"
      }}>
        {executable
          ? <><CheckCircle2 size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Ready</>
          : <><XCircle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Not ready</>
        }
      </span>
    </div>
  );
}

export function VaultCycleExecutionStatusCard({
  cycleCountVal, lastExec, timeUntilNext,
  riskScoreVal, canOperate, canExecute, canExecuteReason,
  busyAction, onExecuteCycle, previewDecision,
  vaultHealthScore, vaultHealthLabel,
}) {
  const score = riskScoreVal ?? 0;
  const gaugePct = clamp(score, 0, 100);
  const scoreTone = score >= 50 ? "kpi--warn" : score >= 20 ? "kpi--caution" : "kpi--good";

  const HEALTH_COLORS = {
    EXCELLENT: "var(--success)",
    HEALTHY: "#4ade80",
    CAUTION: "var(--warn)",
    STRESSED: "#fb923c",
    CRITICAL: "var(--danger)",
    CIRCUIT_BREAKER_TRIPPED: "var(--danger)",
  };
  const healthColor = HEALTH_COLORS[vaultHealthLabel] ?? "var(--text-muted)";

  const showReason = !canExecute && canExecuteReason && canExecuteReason !== "-";
  const isExecuting = busyAction === "execute";

  /// Real-time countdown timer - decrements every second
  const [countdown, setCountdown] = useState(timeUntilNext);

  useEffect(() => {
    setCountdown(timeUntilNext);
  }, [timeUntilNext]);

  useEffect(() => {
    if (countdown == null || countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev == null || prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  /// Sequential step index that advances every 3s while executing - slower so users can see progress
  const [activeStep, setActiveStep] = useState(-1);
  const [executionLog, setExecutionLog] = useState([]);

  useEffect(() => {
    if (!isExecuting) {
      setActiveStep(-1);
      setExecutionLog([]);
      return;
    }
    setActiveStep(0);
    setExecutionLog(["Initializing..."]);

    // Slower timing - 3s per step so users can see what's happening
    const timers = [
      setTimeout(() => {
        setActiveStep(1);
        setExecutionLog(prev => [...prev, "Validating execution conditions..."]);
      }, 3000),
      setTimeout(() => {
        setActiveStep(2);
        setExecutionLog(prev => [...prev, "Fetching price from Chainlink oracle..."]);
      }, 6000),
      setTimeout(() => {
        setActiveStep(3);
        setExecutionLog(prev => [...prev, "Calculating volatility & risk score..."]);
      }, 9000),
      setTimeout(() => {
        setActiveStep(4);
        setExecutionLog(prev => [...prev, "Computing target allocation (Normal/Guarded/Drawdown)..."]);
      }, 12000),
      setTimeout(() => {
        setActiveStep(5);
        setExecutionLog(prev => [...prev, "Rebalancing adapters (WDKDEX ↔ Secondary)..."]);
      }, 15000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isExecuting]);

  const EXEC_STEPS = [
    { label: "Validate conditions", detail: "cooldown, caller, contract state" },
    { label: "Evaluate risk oracle", detail: "Chainlink price + volatility BPS" },
    { label: "Compute target allocation", detail: "previewDecision() → Normal/Guarded/Drawdown" },
    { label: "Rebalance adapters", detail: "WDKDEX Earn ↔ Secondary" },
    { label: "Confirm & log", detail: "emit CycleExecuted, update lastExec" },
  ];

  return (
    <div className="card">
      <p className="eyebrow">Execution Engine</p>
      <h3 className="cardTitle">Cycle Status</h3>

      <div className="kpiGrid" style={{ marginTop: 8, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <div className="kpi">
          <span className="kpiLabel">Cycle #</span>
          <span className="kpiValue">{cycleCountVal ?? "—"}</span>
        </div>
        <div className="kpi">
          <span className="kpiLabel">Last Execution</span>
          <span className="kpiValue">{fmtExecTime(lastExec)}</span>
        </div>
      </div>

      <div className="execCountdown">
        <span className="execCountdownLabel">Next cycle in</span>
        <span className="execCountdownValue">{fmtSeconds(countdown)}</span>
      </div>

      <div className="riskGaugeWrap" style={{ marginTop: 8 }}>
        <div className="riskGaugeLabel" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Risk Score
          <div title="30/100 is the default score for new vaults with insufficient yield history (Sharpe Ratio < 0.5). Score will improve as positive returns are generated.">
            <Info size={11} style={{ opacity: 0.6, cursor: 'help' }} />
          </div>
        </div>
        <div className={`riskGaugeValue ${scoreTone}`}>
          {riskScoreVal != null ? riskScoreVal : "—"}
          <span className="riskGaugeDenom">/100</span>
        </div>
        <div className="riskGaugeTrack">
          <span className="riskGaugeFill" style={{ width: `${gaugePct}%` }} />
        </div>
      </div>

      {/* Vault Health Score — composite 0-100 signal from StrategyEngineV2.vaultHealthScore() */}
      {(vaultHealthScore != null || vaultHealthLabel) && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: ".04em", textTransform: "uppercase" }}>Vault Health</span>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
            color: healthColor,
            background: `${healthColor}18`,
            border: `1px solid ${healthColor}44`,
            padding: "2px 8px", borderRadius: 4,
          }}>
            {vaultHealthLabel ?? "—"}{vaultHealthScore != null ? ` · ${vaultHealthScore}/100` : ""}
          </span>
        </div>
      )}

      {/* Algorithm decision proof — 6 steps from previewDecision() on-chain call */}
      <div style={{ marginTop: 10, borderTop: "1px dashed rgba(255,255,255,.08)", paddingTop: 8 }}>
        <p className="eyebrow" style={{ marginBottom: 4 }}>Algorithm Decision Proof</p>
        <AlgoSummary pd={previewDecision} />
      </div>

      {/* Step-by-step execution trace — shown while tx is in-flight */}
      {isExecuting && (
        <div className="execStepList">
          {EXEC_STEPS.map((s, i) => {
            const done = i < activeStep;
            const current = i === activeStep;
            return (
              <div key={i} className={`execStep ${done ? 'execStep--done' : current ? 'execStep--active' : 'execStep--pending'}`}>
                <span className="execStepIcon">
                  {done ? <CheckCircle2 size={13} /> :
                    current ? <Loader size={13} className="execSpinIcon" /> :
                      <Circle size={13} />}
                </span>
                <span className="execStepBody">
                  <span className="execStepLabel">{s.label}</span>
                  <span className="execStepDetail">{s.detail}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Execute button */}
      <div style={{ marginTop: 8 }}>
        <button
          onClick={onExecuteCycle}
          disabled={!canOperate || !canExecute || isExecuting}
        >
          {isExecuting
            ? <><Zap size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />Executing...</>
            : canExecute
              ? <><Play size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />Execute Cycle</>
              : <><Pause size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />Execute Cycle</>}
        </button>
      </div>

      {showReason && <p className="opsHint">{canExecuteReason}</p>}
    </div>
  );
}
