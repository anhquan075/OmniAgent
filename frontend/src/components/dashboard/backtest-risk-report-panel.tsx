import { ActivityIcon, BarChart3Icon } from "lucide-react";

type Payload = Record<string, any>;

const text = (value: unknown, fallback = "syncing") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

const liveText = (value: unknown, fallback = "syncing") => text(value, fallback)
  .replace(/\bblocked\b/gi, "guarded")
  .replace(/\bwaiting\b/gi, "monitoring")
  .replace(/\bpaused\b/gi, "safety hold");

const pct = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${number >= 0 ? "+" : ""}${number.toFixed(2)}%` : "syncing";
};

export function BacktestRiskReportPanel({ report }: { report?: Payload }) {
  const dry = report?.dryRunSummary ?? {};
  const pnl = report?.pnlSummary ?? {};
  const period = pnl.registrationPeriod ?? {};
  const risk = report?.riskSummary ?? {};
  const blockers = Array.isArray(risk.hardBlockers) ? risk.hardBlockers : [];

  return (
    <section className="runtime-card backtest-risk-panel" aria-label="Backtest risk report">
      <div className="runtime-card-head">
        <span><BarChart3Icon className="h-4 w-4" /> Replay Risk Report</span>
        <b>{text(report?.source, "ledger")}</b>
      </div>
      <div className="runtime-split">
        <ReportStat label="Cycles" value={text(dry.cycles, "0")} />
        <ReportStat label="Submitted" value={text(dry.submittedTrades, "0")} />
        <ReportStat label="Confirmed" value={text(dry.confirmedTrades, "0")} />
        <ReportStat label="Guarded" value={text(dry.blockedTrades, "0")} />
      </div>
      <div className="report-pnl-band">
        <span>
          <small>Since register</small>
          <strong>{pct(period.totalReturnPct ?? pnl.totalReturnPct)}</strong>
        </span>
        <span>
          <small>Max drawdown</small>
          <strong>{pct(period.maxDrawdownPct ?? pnl.maxDrawdownPct)}</strong>
        </span>
        <span>
          <small>Proof</small>
          <strong>{text(risk.proofCoverage)}</strong>
        </span>
      </div>
      <div className="report-blockers">
        <p><ActivityIcon className="h-3.5 w-3.5" /> Policy holds</p>
        <div>
          {blockers.slice(0, 3).map((item: string) => <span key={item}>{liveText(item)}</span>)}
          {!blockers.length ? <span>no hard blockers in replay window</span> : null}
        </div>
      </div>
    </section>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

export default BacktestRiskReportPanel;
