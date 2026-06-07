import {
  ActivityIcon,
  GaugeIcon,
  Layers3Icon,
  RadioTowerIcon,
  ShieldCheckIcon,
  SigmaIcon,
  SparklesIcon,
} from "lucide-react";

type Payload = Record<string, any>;

const text = (value: unknown, fallback = "pending") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

export function QuantTerminalHeader({ state, mode, liveExecution }: { state: Payload; mode: string; liveExecution: boolean }) {
  const bnb = state.prices?.symbols?.BNB ?? {};
  const strategy = state.cycle?.strategyDecision?.decision;
  const hasLivePrice = Number.isFinite(Number(bnb.priceUsd)) && Number(bnb.priceUsd) > 0;
  return (
    <header className="quant-topbar">
      <div className="quant-brand">
        <span className="quant-mark"><SigmaIcon className="h-5 w-5" /></span>
        <div>
          <p>BNB Agentic Quant Terminal</p>
          <h1>BNB/USDT</h1>
        </div>
      </div>
      <TopMetric label="price" value={price(bnb.priceUsd)} />
      <TopMetric label="24h Δ" value={pct(bnb.percentChange24h)} tone={Number(bnb.percentChange24h) >= 0 ? "good" : "bad"} />
      <TopMetric label="regime" value={strategy?.action === "hold" ? "risk compression" : "signal aligned"} tone="warn" />
      <TopMetric label="feed" value={hasLivePrice ? "market live" : "market waiting"} tone={hasLivePrice ? "good" : "warn"} />
      <div className="quant-arm">
        <RadioTowerIcon className="h-4 w-4" />
        <span>{liveExecution ? "Live armed" : mode}</span>
      </div>
    </header>
  );
}

export function SignalTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="quant-signal-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{hint}</em>
    </div>
  );
}

export function FocusAnalysis({ state }: { state: Payload }) {
  const decision = state.cycle?.strategyDecision?.decision ?? {};
  const hasDecision = Boolean(decision.action);
  const action = text(decision.action, "NO TRADE").toUpperCase();
  const confidence = Math.round(Number(decision.confidence ?? 0) * 100);
  return (
    <section className="quant-focus">
      <div className="quant-kicker"><SparklesIcon className="h-3.5 w-3.5" /> Focus analysis</div>
      <h2>{action}</h2>
      <MiniBar label="confidence" value={hasDecision ? confidence : 0} tone={action === "NO TRADE" || action === "HOLD" ? "warn" : "good"} />
      <p>{text(decision.rationale, "No live strategy decision yet. The agent is waiting for market, wallet, policy, and proof evidence before suggesting action.")}</p>
      <MiniBar label="momentum" value={41} tone="warn" />
      <MiniBar label="volume z" value={22} tone="bad" />
    </section>
  );
}

export function ModelStack({ state }: { state: Payload }) {
  const decision = state.cycle?.strategyDecision?.decision ?? {};
  return (
    <section className="quant-stack">
      <StackRow icon={Layers3Icon} label="Feature engine" value="intel / HA / ledger" tone="warn" />
      <StackRow icon={ActivityIcon} label="ML base" value={text(decision.action, "observe")} tone="good" />
      <StackRow icon={GaugeIcon} label="Causal gate" value="observe" tone="neutral" />
      <StackRow icon={ShieldCheckIcon} label="Risk governor" value={`${text(decision.maxAmountUsd, "0")} max`} tone="warn" />
    </section>
  );
}

function TopMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: string }) {
  return <div className={`quant-topmetric is-${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function StackRow({ icon: Icon, label, value, tone }: { icon: typeof ActivityIcon; label: string; value: string; tone: string }) {
  return <div className={`quant-stack-row is-${tone}`}><Icon className="h-4 w-4" /><span>{label}</span><strong>{value}</strong></div>;
}

export function MiniBar({ label, value, tone = "neutral" }: { label: string; value: number; tone?: string }) {
  return <div className={`quant-mini-bar is-${tone}`}><span>{label}</span><i><b style={{ width: `${Math.max(4, Math.min(value, 100))}%` }} /></i><strong>{value}%</strong></div>;
}

function price(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : "waiting";
}

function pct(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "waiting";
}
