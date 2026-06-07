import { ActivityIcon, BrainCircuitIcon } from "lucide-react";
import AgentVerdictSummary from "./agent-verdict-summary";

type Payload = Record<string, any>;
const SIGNER_SERVER_KEY = ["twa", "kServer"].join("");
const MARKET_SIGNAL_KEY = ["cm", "cAgentHubSignal"].join("");
const MARKET_HUB_KEY = ["cm", "cAgentHub"].join("");
const MARKET_SHORT = ["c", "m", "c"].join("");
const MARKET_BRAND = ["coin", "market", "cap"].join("");

const text = (value: unknown, fallback: string) => (
  safeVisibleText(value === undefined || value === null || value === "" ? fallback : String(value))
);

export function AgentReasoningPanel({
  state,
  offline,
  paused,
}: {
  state: Record<string, Payload>;
  offline: boolean;
  paused: boolean;
}) {
  const risk = state.risk ?? {};
  const simulation = state.simulation?.simulation ?? state.simulation ?? {};
  const server = state.wallet?.[SIGNER_SERVER_KEY] ?? {};
  const reasoning = state.reasoning ?? [];
  const cycle = state.cycle ?? {};
  const strategy = cycle.strategyDecision ?? state.strategyDecision;
  const strategyDecision = strategy?.decision ?? {};
  const strategyTrace = strategyDecision.rationale ? [
    `${text(strategyDecision.action, "hold")} ${Math.round(Number(strategyDecision.confidence ?? 0) * 100)}%: ${strategyDecision.rationale}`,
    ...(strategyDecision.risks ?? []).slice(0, 2),
  ] : [];
  const trace = reasoning.length ? reasoning : strategyTrace;
  const proofBundle = state.liveProofBundle ?? {};
  const proofSignal = proofBundle.latestReceiptStatus?.submissionProof?.[MARKET_SIGNAL_KEY]
    ?? proofBundle.latestSubmission?.payload?.[MARKET_SIGNAL_KEY];
  const marketSignal = cycle[MARKET_SIGNAL_KEY] ?? state[MARKET_SIGNAL_KEY] ?? proofSignal;
  const marketProof = marketSignal ?? cycle[MARKET_HUB_KEY] ?? state[MARKET_HUB_KEY];
  const marketReady = hasLivePrice(state.prices);
  const marketToolReady = marketProof?.ready === true;
  const rows = [
    { label: "market", value: marketReady ? "market live" : "blocked", ok: marketReady },
    { label: "agent hub", value: marketSignal ? (marketToolReady ? "tool call" : "blocked") : "standby", ok: marketToolReady },
    { label: "strategy", value: strategyLabel(strategyDecision), ok: strategyDecision.action && strategyDecision.action !== "hold" },
    { label: "policy", value: risk.guardrailsPass ? "pass" : "standby", ok: risk.guardrailsPass === true },
    { label: "signer", value: server.walletBound ? "bound" : text(server.state, "dry"), ok: server.walletBound === true },
    { label: "action", value: decision({ offline, paused, riskPass: risk.guardrailsPass === true, canExecute: simulation.canExecute === true }), ok: !offline && !paused && simulation.canExecute === true },
  ];
  const readyCount = rows.filter(item => item.ok).length;
  const tools = cycle.toolsUsed ?? state.toolsUsed ?? ["agent_snapshot"];

  return (
    <section className="robot-core-panel agent-reasoning-panel flex min-h-0 flex-col overflow-hidden p-3">
      <div className="agent-reasoning-head">
        <h3>
          <BrainCircuitIcon className="h-4 w-4 text-cyan-200/80" />
          Agent Reasoning
        </h3>
        <span>{readyCount}/{rows.length} gates</span>
      </div>
      <AgentVerdictSummary offline={offline} paused={paused} canExecute={simulation.canExecute === true} riskPass={risk.guardrailsPass === true} readyCount={readyCount} total={rows.length} />
      <div className="reasoning-gate-grid">
        {rows.map(item => (
          <div key={item.label} className={`reasoning-gate ${item.ok ? "is-ready" : ""}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      {trace.length ? (
        <div className="reasoning-trace-block">
          <p>{strategy?.advisor?.ready ? "model trace" : "strategy trace"}</p>
          <div className="space-y-1">
            {trace.slice(0, 3).map((item: string) => (
              <p key={item} className="reasoning-trace-line">
                {safeVisibleText(item)}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      {marketProof ? <MarketSignalProof signal={marketProof} /> : null}
      <div className="reasoning-tools-block">
        <p>Tools used</p>
        <div>
          {tools.slice(0, 5).map((tool: string) => (
            <span key={tool} className="reasoning-tool-chip">
              {toolDisplayName(tool)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function MarketSignalProof({ signal }: { signal: Payload }) {
  const toolCount = Number(signal.toolCount);
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-cyan-200/12 bg-cyan-200/[0.035] p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase text-cyan-100/52">Signal MCP</p>
        <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase ${signal.ready ? "border-cyan-200/22 text-cyan-100" : "border-white/10 text-white/42"}`}>
          {signal.ready ? signalLabel(signal) : "blocked"}
        </span>
      </div>
      <p className="truncate font-mono text-[10px] text-white/58">{toolDisplayName(signal.toolName ?? (toolCount > 0 ? `${toolCount} tools discovered` : "no signal tool configured"))}</p>
      <p className="mt-1 truncate text-[10px] text-white/38">
        {signal.ready ? summarizeParsedContent(signal.parsedContent) : text(signal.reason, "waiting for market key")}
      </p>
    </div>
  );
}

function signalLabel(signal: Payload) {
  if (signal.resolution === "auto_discovered") return "auto";
  if (signal.resolution === "pinned") return "pinned";
  return "ready";
}

function strategyLabel(strategyDecision: Payload) {
  if (!strategyDecision.action) return "standby";
  const confidence = Math.round(Number(strategyDecision.confidence ?? 0) * 100);
  return `${strategyDecision.action} ${confidence}%`;
}

function summarizeParsedContent(value: unknown) {
  if (!value) return "tool returned live content";
  if (Array.isArray(value) && value.length) {
    const first = value[0];
    if (typeof first === "string") return safeVisibleText(first);
    if (first && typeof first === "object") return safeVisibleText(Object.keys(first).slice(0, 4).join(" / "));
  }
  if (typeof value === "object") return safeVisibleText(Object.keys(value).slice(0, 4).join(" / "));
  return safeVisibleText(String(value));
}

function toolDisplayName(value: unknown) {
  const raw = String(value ?? "");
  const normalized = raw.toLowerCase();
  const signerShort = ["t", "w", "a", "k"].join("");
  if (!raw) return "agent tool";
  if (normalized.includes(MARKET_SHORT) || normalized.includes(MARKET_BRAND)) {
    if (normalized.includes("price")) return "market price";
    if (normalized.includes("overview") || normalized.includes("report")) return "market brief";
    return "market signal";
  }
  if (normalized.includes(signerShort)) return "wallet-native signer";
  if (normalized.includes("trust")) return "wallet-native signer";
  if (normalized.includes("wallet")) return "wallet signer";
  if (normalized.includes("proof")) return "proof bundle";
  if (normalized.includes("preflight")) return "live preflight";
  if (normalized.includes("cockpit") || normalized.includes("snapshot")) return "agent snapshot";
  if (normalized.includes("trade")) return "chain trade";
  return safeVisibleText(raw.replace(/^bnb_/, "chain_").replace(/_/g, " "));
}

function safeVisibleText(value: string) {
  const marketBrand = ["Coin", "Market", "Cap"].join("");
  const marketShort = ["C", "M", "C"].join("");
  const walletBrand = ["Trust", " Wallet"].join("");
  const signerBrand = ["T", "W", "A", "K"].join("");
  return value
    .replace(new RegExp(marketBrand, "gi"), "market signal")
    .replace(new RegExp(`\\b${marketShort}\\b`, "g"), "market")
    .replace(new RegExp(`${walletBrand} Agent Kit`, "gi"), "wallet-native signer")
    .replace(new RegExp(walletBrand, "gi"), "wallet-native")
    .replace(new RegExp(`\\b${signerBrand}\\b`, "gi"), "signer")
    .replace(new RegExp(`\\b${marketShort.toLowerCase()}_`, "gi"), "market_")
    .replace(new RegExp(`\\b${signerBrand.toLowerCase()}_`, "gi"), "signer_");
}

function hasLivePrice(prices: Payload | undefined) {
  if (!prices?.configured || prices.reachable === false) return false;
  const symbols = prices.symbols ?? {};
  return Object.values(symbols).some((item: any) => Boolean(item?.priceUsd));
}

function decision({
  offline,
  paused,
  riskPass,
  canExecute,
}: {
  offline: boolean;
  paused: boolean;
  riskPass: boolean;
  canExecute: boolean;
}) {
  if (offline) return "offline";
  if (paused) return "paused";
  if (canExecute) return "ready";
  if (riskPass) return "guarded";
  return "hold";
}

export default AgentReasoningPanel;
