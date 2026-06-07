import { BarChart3Icon } from "lucide-react";
import { MiniBar } from "./quant-terminal-widgets";

type Payload = Record<string, any>;

const text = (value: unknown, fallback = "pending") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

export function MarketChartPanel({ state }: { state: Payload }) {
  const bnb = state.prices?.symbols?.BNB ?? {};
  const priceValue = Number(bnb.priceUsd);
  const hasLivePrice = Number.isFinite(priceValue) && priceValue > 0;

  return (
    <section className="quant-chart-panel">
      <div className="quant-chart-toolbar">
        <span><BarChart3Icon className="h-4 w-4" /> Market workspace</span>
        <strong>{price(priceValue)}</strong>
      </div>
      <div className="quant-chart-stage">
        <svg viewBox="0 0 780 360" className="quant-chart" role="img" aria-label="BNB tactical price chart">
          <defs>
            <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(71, 118, 255, 0.42)" />
              <stop offset="100%" stopColor="rgba(71, 118, 255, 0.02)" />
            </linearGradient>
          </defs>
          {Array.from({ length: 12 }).map((_, index) => <line key={`v-${index}`} x1={index * 70} x2={index * 70} y1="0" y2="360" />)}
          {Array.from({ length: 7 }).map((_, index) => <line key={`h-${index}`} x1="0" x2="780" y1={index * 58} y2={index * 58} />)}
          <path className="quant-chart-fill" d={chartAreaPath(priceValue)} />
          <path className="quant-chart-line" d={chartLinePath(priceValue)} />
          <g className="quant-volume">
            {Array.from({ length: 34 }).map((_, index) => (
              <rect key={index} x={index * 22 + 4} y={310 - ((index * 17) % 72)} width="8" height={38 + ((index * 13) % 52)} />
            ))}
          </g>
          <text x="686" y="176">{price(priceValue)}</text>
        </svg>
        {!hasLivePrice ? (
          <div className="quant-chart-empty">
            <strong>Awaiting live market feed</strong>
            <span>Chart stays in observation mode until a fresh BNB price arrives.</span>
          </div>
        ) : null}
      </div>
      <div className="quant-event-tape">
        <span>event tape</span>
        <strong>{state.cycle ? "cycle recorded" : "monitoring"}</strong>
      </div>
    </section>
  );
}

export function ResearchMatrix({ state }: { state: Payload }) {
  const marketReady = Boolean(state.prices?.configured);
  const overview = state.marketOverview ?? {};
  const rows = ["Market feed", "Momentum", "ML base", "Causal gate", "Signer gate", "Risk stack"];
  return (
    <section className="quant-research">
      <div className="quant-section-title">Research Stack</div>
      <div className={`cmc-overview-card ${overview.ready ? "is-ready" : ""}`}>
        <div className="cmc-overview-head">
          <span>CMC Skill Brief</span>
          <strong>{overview.ready ? text(overview.confidence, "recorded") : text(overview.status, "not run")}</strong>
        </div>
        <p>{marketOverviewText(overview)}</p>
        <div className="cmc-overview-meta">
          <span>{text(overview.uniqueName ?? overview.skillName, "daily_market_overview")}</span>
          <span>{overview.timestamp ? shortTime(overview.timestamp) : "waiting"}</span>
        </div>
      </div>
      <div className="quant-card-grid">
        {["OHLC", "trend", "volume", "dispersion", "risk map", "drawdown", "proof drift"].map(item => <span key={item}>{item}</span>)}
      </div>
      <div className="quant-research-bars">
        {rows.map((row, index) => (
          <MiniBar key={row} label={row} value={[marketReady ? 86 : 0, 41, 39, 52, 28, 68][index]} tone={index === 0 && !marketReady ? "bad" : index > 3 ? "warn" : "good"} />
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

function price(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : "waiting";
}

function marketOverviewText(overview: Payload) {
  const report = String(overview.formattedReport ?? "");
  const normalized = report
    .replace(/\*\*/g, "")
    .replace(/[🚨📰💡🏛💰🔗👁️🕐]/g, "")
    .split("\n")
    .map(line => line.replace(/^- /, "").trim())
    .filter(Boolean)
    .find(line => !["TL;DR", "Details"].includes(line));
  return normalized || text(overview.reason, "Run daily_market_overview to add a market brief to the cockpit.");
}

function shortTime(value: unknown) {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? text(value, "waiting") : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function chartLinePath(seed: number) {
  const lift = Number.isFinite(seed) ? (seed % 17) : 9;
  return `M0 262 C44 250 70 270 112 246 S176 222 224 230 S292 214 336 200 S414 184 458 190 S520 162 566 154 S646 ${122 - lift} 690 132 S732 150 780 138`;
}

function chartAreaPath(seed: number) {
  return `${chartLinePath(seed)} L780 360 L0 360 Z`;
}
