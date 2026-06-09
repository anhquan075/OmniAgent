import {
  ActivityIcon,
  BadgeCheckIcon,
  RadioTowerIcon,
  ShieldCheckIcon,
  SigmaIcon,
  SparklesIcon,
  WalletCardsIcon,
} from "lucide-react";

type Payload = Record<string, any>;

const text = (value: unknown, fallback = "pending") => (
  value === undefined || value === null || value === "" ? fallback : String(value)
);

export function QuantTerminalHeader({ state, mode, liveExecution, offline }: { state: Payload; mode: string; liveExecution: boolean; offline: boolean }) {
  const bnb = state.prices?.symbols?.BNB ?? {};
  const strategy = state.cycle?.strategyDecision?.decision;
  const hasLivePrice = Number.isFinite(Number(bnb.priceUsd)) && Number(bnb.priceUsd) > 0;
  const priceLabel = offline ? "offline" : price(bnb.priceUsd);
  const moveLabel = offline ? "no feed" : pct(bnb.percentChange24h);
  const regimeLabel = offline ? "read-only" : strategy?.action === "hold" ? "risk managed" : "signal aligned";
  const feedLabel = offline ? "offline" : hasLivePrice ? "market live" : "market sync";

  return (
    <header className="quant-topbar">
      <div className="quant-brand">
        <span className="quant-mark"><SigmaIcon className="h-5 w-5" /></span>
        <div>
          <p>BNB Agentic Quant Terminal</p>
          <h1>BNB/USDT</h1>
        </div>
      </div>
      <TopMetric label="price" value={priceLabel} tone={offline ? "warn" : "neutral"} />
      <TopMetric label="24h move" value={moveLabel} tone={offline ? "warn" : Number(bnb.percentChange24h) >= 0 ? "good" : "bad"} />
      <TopMetric label="trade stance" value={regimeLabel} tone="warn" />
      <TopMetric label="feed" value={feedLabel} tone={hasLivePrice ? "good" : "warn"} />
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

export function DecisionContextPanel({ state, offline, loopStatusLabel, liveExecution }: { state: Payload; offline: boolean; loopStatusLabel: string; liveExecution: boolean }) {
  const bnb = state.prices?.symbols?.BNB ?? {};
  const decision = state.cycle?.strategyDecision?.decision ?? {};
  const proof = state.liveProofBundle ?? {};
  const signer = state[["twa", "kStatus"].join("")] ?? {};
  const hasDecision = Boolean(decision.action);
  const marketReady = Boolean(state.prices?.configured);
  const policyReady = Boolean(state.livePreflight?.readyForLiveTrade ?? state.policyStatus?.approved);
  const hasTxProof = Boolean(proof.latestReceiptStatus?.txHash ?? proof.latestSubmission?.txHash ?? proof.txEvents?.[0]?.txHash);
  const confidence = Math.round(Number(decision.confidence ?? 0) * 100);
  const action = offline ? "No live action" : text(decision.action, "Monitoring");
  const change24h = Number(bnb.percentChange24h);
  const hasMove = Number.isFinite(change24h);
  const volume24h = Number(bnb.volume24h);
  const hasVolume = Number.isFinite(volume24h) && volume24h > 0;
  const rationale = offline
    ? "The backend session is offline, so market data, wallet checks, and proof checks are treated as unavailable."
    : "The agent is live and continuously checks market, wallet, policy, and proof evidence before suggesting action.";
  const loopCopy = liveExecution
    ? "Live execution is gated by proof and signer readiness."
    : offline
      ? "Read-only while the backend session is offline; no action can be sent from this view."
      : "Execution remains controlled by backend policy.";

  return (
    <section className="quant-context-panel" aria-label="Decision context">
      <div className="quant-context-lead">
        <div className="quant-kicker"><SparklesIcon className="h-3.5 w-3.5" /> Why this verdict</div>
        <h2>{action}</h2>
        <p>{text(decision.rationale, rationale)}</p>
        <div className="quant-context-bars">
          <MiniBar label="confidence" value={hasDecision ? confidence : null} display={offline ? "offline" : undefined} tone={action === "Monitoring" || action === "hold" || offline ? "warn" : "good"} />
          <MiniBar label="24h move" value={hasMove ? Math.min(Math.abs(change24h) * 10, 100) : null} display={hasMove ? pct(change24h) : offline ? "no feed" : "scanning"} tone={hasMove ? change24h >= 0 ? "good" : "bad" : "syncing"} />
          <MiniBar label="24h volume" value={hasVolume ? Math.min(Math.log10(volume24h) * 10, 100) : null} display={hasVolume ? compactUsd(volume24h) : offline ? "no feed" : "scanning"} tone={hasVolume ? "neutral" : "syncing"} />
        </div>
      </div>
      <div className="quant-context-checks">
        <StackRow icon={RadioTowerIcon} label="Market signal" value={offline ? "backend offline" : marketReady ? "live feed" : "market sync"} tone={marketReady ? "good" : "warn"} />
        <StackRow icon={ActivityIcon} label="Strategy decision" value={decision.action ? `${text(decision.action)} ${confidence}%` : "monitoring"} tone={decision.action ? "good" : "neutral"} />
        <StackRow icon={ShieldCheckIcon} label="Policy gate" value={policyReady ? "pass" : "guarded"} tone={policyReady ? "good" : "warn"} />
        <StackRow icon={WalletCardsIcon} label="Wallet signer" value={signer.ready ? "ready" : offline ? "not checked" : "syncing"} tone={signer.ready ? "good" : "neutral"} />
        <StackRow icon={BadgeCheckIcon} label="BSC proof" value={hasTxProof ? "proof linked" : offline ? "not checked" : "proof sync"} tone={hasTxProof ? "good" : "warn"} />
      </div>
      <div className="quant-context-loop">
        <span>Backend agent loop</span>
        <strong>{loopStatusLabel}</strong>
        <p>{loopCopy}</p>
      </div>
    </section>
  );
}

function TopMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: string }) {
  return <div className={`quant-topmetric is-${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function StackRow({ icon: Icon, label, value, tone }: { icon: typeof ActivityIcon; label: string; value: string; tone: string }) {
  return <div className={`quant-stack-row is-${tone}`}><Icon className="h-4 w-4" /><span>{label}</span><strong>{value}</strong></div>;
}

export function MiniBar({ label, value, tone = "neutral", display }: { label: string; value: number | null; tone?: string; display?: string }) {
  const hasValue = Number.isFinite(value);
  const width = hasValue ? Math.max(4, Math.min(Number(value), 100)) : 0;
  return <div className={`quant-mini-bar is-${hasValue ? tone : "syncing"}`}><span>{label}</span><i><b style={{ width: `${width}%` }} /></i><strong>{display ?? (hasValue ? `${Math.round(Number(value))}%` : "scanning")}</strong></div>;
}

function price(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : "scanning";
}

function pct(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "scanning";
}

function compactUsd(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "scanning";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}
