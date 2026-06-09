import {
  CheckCircle2Icon,
  CircleDashedIcon,
  ExternalLinkIcon,
  FileClockIcon,
  TriangleAlertIcon,
} from "lucide-react";

interface TradeProofTimelineProps {
  workOrders: any[];
  recovery: any[];
  ledgerEvents: any[];
  running?: boolean;
}

const text = (value: unknown, fallback = "syncing") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

function humanizeState(value: unknown, fallback = "monitoring") {
  const raw = text(value, fallback);
  return raw
    .replace(/^waiting-for-policy-intent$/i, "live policy monitor")
    .replace(/^policy-intent$/i, "policy approval")
    .replace(/^pending$/i, "syncing")
    .replace(/^blocked$/i, "guarded")
    .replace(/^paused$/i, "safety hold")
    .replace(/[-_]+/g, " ");
}

const txHashOf = (event: any) => event?.txHash ?? event?.payload?.txHash ?? event?.payload?.proof?.txHash;
const short = (value: string) => `${value.slice(0, 8)}...${value.slice(-6)}`;

export function TradeProofTimeline({ workOrders, recovery, ledgerEvents, running = false }: TradeProofTimelineProps) {
  const order = workOrders[0];
  const steps = order?.steps ?? [];
  const txEvents = ledgerEvents.filter(txHashOf);
  const latestProof = txEvents[0];
  const firstPendingIndex = steps.findIndex((step: any) => text(step.status).toLowerCase() !== "done");
  const activeIndex = firstPendingIndex === -1 ? -1 : firstPendingIndex;

  return (
    <div className="trade-plan-panel min-h-0 flex-1 overflow-y-auto custom-scrollbar">
      <div className="trade-plan-card">
        <div className="trade-plan-head">
          <div className="min-w-0">
            <p className="trade-plan-eyebrow">Current trade plan</p>
            <p className="trade-plan-route">
              {order ? humanizeState(order.id, "live policy monitor") : "live policy monitor"}
            </p>
          </div>
          <StateBadge state={humanizeState(order?.state, "monitoring")} />
        </div>
        <div className="trade-plan-stats">
          <MiniStat label="Pair" value={`${text(order?.symbol, "BSC")} / ${text(order?.side, "hold")}`} />
          <MiniStat label="Ledger" value={`${ledgerEvents.length} events`} />
          <MiniStat label="Proof" value={latestProof ? "linked" : "none"} />
        </div>
      </div>

      {steps.length ? (
        <div className={`trade-stage-rail rounded-md border border-white/10 bg-white/[0.025] p-2 ${running ? "is-running" : ""}`}>
          {steps.map((step: any, index: number) => (
            <StageStep
              key={step.id ?? `${step.label}-${index}`}
              step={step}
              index={index}
              active={index === activeIndex}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-white/12 p-3 text-[12px] text-white/42">
          No trade plan has been recorded yet.
        </div>
      )}

      <div className="mt-2 grid gap-2 lg:grid-cols-[1fr_0.95fr]">
        <ProofCard event={latestProof} />
        <RecoveryCard recovery={recovery} />
      </div>

      <div className="mt-2 rounded-md border border-white/10 bg-black/15 p-2">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-white/38">
          <span>Recent evidence</span>
          <span className="font-mono">{Math.min(ledgerEvents.length, 4)} shown</span>
        </div>
        {ledgerEvents.length === 0 ? (
          <div className="py-2 text-[12px] text-white/42">No submitted trade evidence yet.</div>
        ) : (
          ledgerEvents.slice(0, 4).map((event: any, index: number) => (
            <EvidenceRow key={event.id ?? index} event={event} index={index} />
          ))
        )}
      </div>
    </div>
  );
}

function StageStep({ step, index, active }: { step: any; index: number; active: boolean }) {
  const status = text(step.status).toLowerCase();
  const done = status === "done";
  const guarded = status === "blocked";
  const Icon = done ? CheckCircle2Icon : guarded ? TriangleAlertIcon : CircleDashedIcon;
  const tone = done ? "text-neon-green" : guarded ? "text-red-200" : "text-white/38";

  return (
    <div className={`timeline-step-card grid grid-cols-[34px_1fr] items-center gap-2 py-1.5 ${active ? "is-active" : ""} ${done ? "is-done" : ""}`} style={{ animationDelay: `${index * 70}ms` }}>
      <div className={`stage-node grid h-8 w-8 place-items-center rounded-sm border bg-black/80 ${done ? "border-neon-green/35" : guarded ? "border-red-300/30" : active ? "border-bnb-gold/45" : "border-white/10"}`}>
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[10px] text-white/34">{String(index + 1).padStart(2, "0")}</span>
          <p className="truncate text-[12px] font-semibold text-white/78">{text(step.label, "Proof stage")}</p>
          {active ? <span className="shrink-0 rounded-sm border border-bnb-gold/20 bg-bnb-gold/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-bnb-gold">live</span> : null}
        </div>
        <p className="truncate font-mono text-[10px] text-white/38">{safeTimelineText(text(step.evidence, "syncing"))}</p>
      </div>
    </div>
  );
}

function ProofCard({ event }: { event: any }) {
  const hash = event ? String(txHashOf(event)) : "";
  return (
    <div className="rounded-md border border-emerald-300/15 bg-emerald-300/[0.045] p-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-emerald-200/70">
        <FileClockIcon className="h-3.5 w-3.5" />
        Chain proof
      </div>
      {hash ? (
        <a href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-sm border border-emerald-300/18 bg-black/18 px-2 py-1 font-mono text-[11px] text-emerald-100 hover:border-emerald-200/40">
          <span className="truncate">{short(hash)}</span>
          <ExternalLinkIcon className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <p className="text-[12px] text-white/44">Monitoring for submitted BSC transaction proof.</p>
      )}
    </div>
  );
}

function RecoveryCard({ recovery }: { recovery: any[] }) {
  return (
    <div className="rounded-md border border-bnb-amber/20 bg-bnb-amber/[0.04] p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase text-bnb-amber">Recovery queue</div>
      {recovery.length === 0 ? (
        <p className="py-1 text-[12px] text-white/44">No recovery action required.</p>
      ) : recovery.slice(0, 2).map((item) => (
        <div key={item.id} className="grid grid-cols-[1fr_auto] gap-2 border-t border-white/10 py-1.5 text-[11px] first:border-t-0">
          <span className="min-w-0 truncate text-white/72">{item.label}</span>
          <span className="rounded-sm border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/46">{item.safeNextAction ?? item.toolName ?? item.severity}</span>
        </div>
      ))}
    </div>
  );
}

function EvidenceRow({ event, index }: { event: any; index: number }) {
  const hash = txHashOf(event);
  return (
    <div className="timeline-step-card grid grid-cols-[1fr_auto] items-center gap-2 border-t border-white/10 py-1.5 text-[11px] first:border-t-0" style={{ animationDelay: `${index * 55}ms` }}>
      <div className="min-w-0">
        <p className="truncate font-mono text-bnb-gold">{text(event.eventType, "event")}</p>
        <p className="truncate text-[10px] text-white/40">{text(event.payload?.proof?.status ?? event.symbol ?? event.action, "system")}</p>
      </div>
      {hash ? (
        <a href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer" className="rounded-sm border border-white/10 px-1.5 py-1 font-mono text-[10px] text-white/48 hover:text-bnb-gold">
          {short(String(hash))}
        </a>
      ) : (
        <span className="rounded-sm border border-white/10 px-1.5 py-1 font-mono text-[10px] text-white/34">#{event.id}</span>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="trade-plan-stat"><p>{label}</p><strong>{value}</strong></div>;
}

function StateBadge({ state }: { state: string }) {
  return <span className="trade-plan-state">{humanizeState(state)}</span>;
}

function safeTimelineText(value: string) {
  return value
    .replace(/\bblocked\b/gi, "guarded")
    .replace(/\bwaiting\b/gi, "monitoring")
    .replace(/\bpaused\b/gi, "safety hold");
}
