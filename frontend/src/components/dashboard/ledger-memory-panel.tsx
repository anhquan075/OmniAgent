import { BookOpenTextIcon, HistoryIcon } from "lucide-react";

type Payload = Record<string, any>;

const text = (value: unknown, fallback = "none") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

const liveText = (value: unknown, fallback = "none") => text(value, fallback)
  .replace(/\bblocked\b/gi, "guarded")
  .replace(/\bwaiting\b/gi, "monitoring")
  .replace(/\bpaused\b/gi, "safety hold");

const reasonLabels: Record<string, string> = {
  funded_route: "Router-backed funded route is not ready.",
  router_quote_valid: "Router quote is not valid yet.",
  emergency_pause: "Emergency pause is enabled.",
  emergency_pause_enabled: "Emergency pause is enabled.",
  cmc_signal_required: "Server-verified CMC signal is required.",
  "agent wallet is not configured": "Agent wallet is not configured.",
  "Agent wallet address is not configured": "Agent wallet address is not configured.",
  "BNB live trading is disabled": "BNB live trading is disabled.",
  "ALLOW_AGENT_RUN is false": "ALLOW_AGENT_RUN is false.",
  "router-backed transaction is required": "Router-backed transaction is required.",
  guarded: "Safety gates held.",
};

const humanReason = (value: unknown) => {
  const clean = liveText(value).trim();
  return reasonLabels[clean] ?? clean;
};

const reasonParts = (value: unknown, fallback = "none") => (
  liveText(value, fallback)
    .replace(/\n/g, ";")
    .split(";")
    .map(item => humanReason(item))
    .filter(Boolean)
);

const list = (value: unknown): string[] => Array.isArray(value)
  ? value.flatMap(item => reasonParts(item)).filter(Boolean)
  : [];

const unique = (rows: string[]) => {
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = row.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const actionText = (value: unknown, status: unknown, guarded: boolean) => {
  const raw = liveText(value, "observe").trim();
  if (guarded || /\bguarded\b/i.test(liveText(status, ""))) {
    if (/^(execute[_ ]trade|buy|sell|trade)$/i.test(raw)) return "safety hold";
  }
  return raw.replace(/_/g, " ");
};

const tradeThesis = (rows: string[], guarded: boolean) => {
  const filtered = guarded
    ? rows.filter(item => (
      !/live preflight passed all deterministic backend gates/i.test(item)
      && !/no executable trade thesis/i.test(item)
    ))
    : rows;
  return filtered.length
    ? filtered
    : [guarded ? "Execution thesis is suppressed until live gates clear." : "No executable trade thesis recorded yet."];
};

const blockerSummary = (rows: string[], fallback: unknown) => {
  if (!rows.length) return reasonParts(fallback, "No trade decision recorded yet.")[0];
  const gates = [
    [/route|router/i, "route"],
    [/emergency pause/i, "emergency pause"],
    [/wallet/i, "wallet"],
    [/BNB live trading|ALLOW_AGENT_RUN/i, "live flags"],
    [/CMC/i, "CMC signal"],
  ].flatMap(([pattern, label]) => rows.some(row => (pattern as RegExp).test(row)) ? [label as string] : []);
  const shown = unique(gates).slice(0, 3);
  const extra = unique(gates).length - shown.length;
  return `Live execution held by ${shown.join(", ")}${extra > 0 ? ` and ${extra} more` : ""}.`;
};

const episodeRows = (episodes: Payload[]) => {
  const counts = new Map<string, { eventType: string; summary: string; count: number }>();
  for (const item of episodes) {
    const eventType = liveText(item.eventType).replace(/_/g, " ");
    const rawSummary = reasonParts(item.summary, "recorded")[0];
    const summary = eventType === "risk checked" && /^(buy|sell|trade)$/i.test(rawSummary)
      ? "Risk policy reviewed."
      : rawSummary;
    const key = `${eventType}:${summary}`.toLowerCase();
    const existing = counts.get(key);
    counts.set(key, existing ? { ...existing, count: existing.count + 1 } : { eventType, summary, count: 1 });
  }
  return [...counts.values()].slice(0, 4);
};

export function LedgerMemoryPanel({ memory }: { memory?: Payload }) {
  const latest = memory?.latestDecision ?? {};
  const layers = memory?.memoryLayers ?? {};
  const whyNoTrade = list(memory?.whyNoTrade);
  const guarded = whyNoTrade.length > 0 && !whyNoTrade.every(item => /no active no-trade reason/i.test(item));
  const whyTrade = tradeThesis(list(memory?.whyTrade), guarded);
  const episodes = Array.isArray(layers.episodic) ? layers.episodic : [];
  const latestReason = guarded
    ? blockerSummary(whyNoTrade, latest.reason)
    : reasonParts(latest.reason, "No trade decision recorded yet.")[0];
  const recentEpisodes = episodeRows(episodes);

  return (
    <section className="runtime-card ledger-memory-panel" aria-label="Ledger memory">
      <div className="runtime-card-head">
        <span><BookOpenTextIcon className="h-4 w-4" /> Ledger Memory</span>
        <b>{liveText(latest.status, "monitoring")}</b>
      </div>
      <div className="memory-decision">
        <span>{actionText(latest.action, latest.status, guarded)}</span>
        <strong>{latestReason}</strong>
      </div>
      <div className={`memory-columns${guarded ? " is-guarded" : ""}`}>
        <MemoryList title={guarded ? "Trade thesis" : "Why trade"} rows={whyTrade} tone={guarded ? "neutral" : "good"} />
        <MemoryList title={guarded ? "Unlock live execution" : "Why no trade"} rows={whyNoTrade} tone="warn" />
      </div>
      <div className="memory-episodes">
        <p><HistoryIcon className="h-3.5 w-3.5" /> Recent episodes</p>
        <div>
          {recentEpisodes.map(item => (
            <span key={`${item.eventType}-${item.summary}`}>
              <small>{item.eventType}{item.count > 1 ? ` x${item.count}` : ""}</small>
              <strong>{item.summary}</strong>
            </span>
          ))}
          {!recentEpisodes.length ? <span><small>ledger</small><strong>waiting for events</strong></span> : null}
        </div>
      </div>
    </section>
  );
}

function MemoryList({ title, rows, tone }: { title: string; rows: string[]; tone: string }) {
  return (
    <div className={`memory-list is-${tone}`}>
      <p>{title}</p>
      {rows.slice(0, 3).map(item => <span key={item}>{item}</span>)}
      {!rows.length ? <span>no evidence yet</span> : null}
    </div>
  );
}

export default LedgerMemoryPanel;
