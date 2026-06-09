import { BookOpenTextIcon, HistoryIcon } from "lucide-react";

type Payload = Record<string, any>;

const text = (value: unknown, fallback = "none") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

const liveText = (value: unknown, fallback = "none") => text(value, fallback)
  .replace(/\bblocked\b/gi, "guarded")
  .replace(/\bwaiting\b/gi, "monitoring")
  .replace(/\bpaused\b/gi, "safety hold");

const list = (value: unknown): string[] => Array.isArray(value)
  ? value.map(item => liveText(item)).filter(Boolean)
  : [];

export function LedgerMemoryPanel({ memory }: { memory?: Payload }) {
  const latest = memory?.latestDecision ?? {};
  const layers = memory?.memoryLayers ?? {};
  const whyTrade = list(memory?.whyTrade);
  const whyNoTrade = list(memory?.whyNoTrade);
  const episodes = Array.isArray(layers.episodic) ? layers.episodic : [];

  return (
    <section className="runtime-card ledger-memory-panel" aria-label="Ledger memory">
      <div className="runtime-card-head">
        <span><BookOpenTextIcon className="h-4 w-4" /> Ledger Memory</span>
        <b>{liveText(latest.status, "monitoring")}</b>
      </div>
      <div className="memory-decision">
        <span>{liveText(latest.action, "observe")}</span>
        <strong>{liveText(latest.reason, "No trade decision recorded yet.")}</strong>
      </div>
      <div className="memory-columns">
        <MemoryList title="Why trade" rows={whyTrade} tone="good" />
        <MemoryList title="Why no trade" rows={whyNoTrade} tone="warn" />
      </div>
      <div className="memory-episodes">
        <p><HistoryIcon className="h-3.5 w-3.5" /> Recent episodes</p>
        <div>
          {episodes.slice(0, 3).map((item: Payload, index: number) => (
            <span key={`${text(item.eventType)}-${index}`}>
              <small>{liveText(item.eventType).replace(/_/g, " ")}</small>
              <strong>{liveText(item.summary, "recorded")}</strong>
            </span>
          ))}
          {!episodes.length ? <span><small>ledger</small><strong>waiting for events</strong></span> : null}
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
