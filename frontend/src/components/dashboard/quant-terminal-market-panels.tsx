import { useState } from "react";
import { BarChart3Icon, NewspaperIcon } from "lucide-react";
import { MiniBar } from "./quant-terminal-widgets";

type Payload = Record<string, any>;

const text = (value: unknown, fallback = "pending") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

export function MarketChartPanel({ state }: { state: Payload }) {
  const bnb = state.prices?.symbols?.BNB ?? {};
  const priceUsd = Number(bnb.priceUsd);
  const change24h = Number(bnb.percentChange24h);
  const hasPrice = Number.isFinite(priceUsd) && priceUsd > 0;
  const points = chartPoints(priceUsd || 588, Number.isFinite(change24h) ? change24h : 0);
  const line = chartLinePath(points);
  const area = chartAreaPath(points);

  return (
    <section className="quant-chart-panel">
      <div className="quant-section-title">
        <span><BarChart3Icon className="h-4 w-4" /> Market tape</span>
        <b>{hasPrice ? `$${priceUsd.toFixed(2)}` : "waiting"}</b>
      </div>
      <div className="quant-chart-toolbar">
        <span>{hasPrice ? "CMC live quote" : "CMC quote waiting"}</span>
        <strong className={change24h >= 0 ? "is-good" : "is-bad"}>{Number.isFinite(change24h) ? `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%` : "pending"}</strong>
      </div>
      <svg className="quant-chart" viewBox="0 0 420 190" role="img" aria-label="BNB market tape">
        <defs>
          <linearGradient id="market-tape-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(77, 219, 190, 0.42)" />
            <stop offset="100%" stopColor="rgba(77, 219, 190, 0)" />
          </linearGradient>
        </defs>
        <path className="quant-chart-grid" d="M18 42H402M18 88H402M18 134H402" />
        <path className="quant-chart-area" d={area} />
        <path className="quant-chart-line" d={line} />
        {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 4 : 2} />)}
      </svg>
      {!hasPrice ? <p className="quant-chart-empty">Connect CMC to replace the synthetic tape with a live BNB quote.</p> : null}
    </section>
  );
}

export function ResearchMatrix({
  state,
  runningMarketOverview = false,
  marketOverviewError,
  onRunMarketOverview,
}: {
  state: Payload;
  runningMarketOverview?: boolean;
  marketOverviewError?: string | null;
  onRunMarketOverview?: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState("copy report");
  const marketReady = Boolean(state.prices?.configured);
  const overview = state.marketOverview ?? {};
  const report = text(overview.formattedReport, "");
  const hasReport = Boolean(report);
  const rows = ["Market feed", "Macro brief", "ETF demand", "Cross-asset", "Signer gate", "Risk stack"];
  const statusText = runningMarketOverview ? "running" : overview.ready ? "recorded" : text(overview.status, "waiting");
  const copyReport = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("copy report"), 1600);
    } catch {
      setCopyStatus("copy failed");
      window.setTimeout(() => setCopyStatus("copy report"), 1600);
    }
  };

  return (
    <section className="quant-research">
      <div className="quant-section-title">
        <span><NewspaperIcon className="h-4 w-4" /> Research stack</span>
        <b>{statusText}</b>
      </div>
      <div className={`cmc-overview-card ${overview.ready ? "is-ready" : ""}`}>
        <div className="cmc-overview-head">
          <span>CMC Skill Brief</span>
          <strong>{runningMarketOverview ? "running" : overview.ready ? text(overview.confidence, "medium") : text(overview.status, "not run")}</strong>
        </div>
        <p>{marketOverviewText(overview)}</p>
        {marketOverviewError ? <p className="cmc-overview-error">{marketOverviewError}</p> : null}
        <div className="cmc-overview-actions">
          <button type="button" onClick={onRunMarketOverview} disabled={!onRunMarketOverview || runningMarketOverview}>
            {runningMarketOverview ? "Running CMC" : "Run CMC"}
          </button>
          {hasReport ? <button type="button" onClick={() => void copyReport()}>{copyStatus}</button> : null}
          <span>{overview.ready ? "report recorded" : "manual report"}</span>
        </div>
        {hasReport ? <pre className="cmc-report-preview">{reportPreview(report)}</pre> : null}
        <div className="cmc-overview-meta">
          <span>{text(overview.uniqueName ?? overview.skillName, "daily_market_overview")}</span>
          <span>{overview.timestamp ? shortTime(overview.timestamp) : "waiting"}</span>
        </div>
      </div>
      <div className="quant-card-grid">
        {["price", "flow", "macro", "policy", "risk", "proof"].map(item => <span key={item}>{item}</span>)}
      </div>
      <div className="quant-research-bars">
        {rows.map((row, index) => (
          <MiniBar key={row} label={row} value={[marketReady ? 86 : 0, overview.ready ? 72 : 0, 48, 52, 28, 68][index]} tone={index === 0 && !marketReady ? "bad" : index > 3 ? "warn" : "good"} />
        ))}
      </div>
    </section>
  );
}

export function DecisionSummary({ state }: { state: Payload }) {
  const decision = state.cycle?.strategyDecision?.decision ?? {};
  return (
    <section className="quant-summary">
      <span>Decision summary</span>
      <strong>{text(decision.action, "NO TRADE").toUpperCase()}</strong>
      <p>{text(decision.rationale, "Observation only. No executable order is proposed until all proof and risk gates pass.")}</p>
    </section>
  );
}

function marketOverviewText(overview: Payload) {
  const report = text(overview.formattedReport, "");
  const summary = text(overview.summary ?? overview.reason, "");
  const normalized = (summary || report.split("\n").find(line => line && !line.startsWith("*")) || "").replace(/\s+/g, " ").trim();
  return normalized || "Run daily_market_overview to add a market brief to the cockpit.";
}

function reportPreview(report: string) {
  const lines = report.split("\n").filter(line => line.trim()).slice(0, 8);
  return lines.join("\n");
}

function shortTime(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "waiting";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function chartPoints(base: number, change: number) {
  const drift = Math.max(-14, Math.min(14, change * 2.4));
  return Array.from({ length: 12 }, (_, index) => {
    const x = 18 + index * 34;
    const wave = Math.sin(index * 0.9) * 16 + Math.cos(index * 0.45) * 8;
    const y = 104 - drift - wave - (index - 5.5) * Math.sign(drift || 1) * 1.8 - (base % 7);
    return { x, y: Math.max(24, Math.min(164, y)) };
  });
}

function chartLinePath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
}

function chartAreaPath(points: Array<{ x: number; y: number }>) {
  return `${chartLinePath(points)} L${points[points.length - 1].x} 176 L${points[0].x} 176 Z`;
}
