import { ActivityIcon, BrainCircuitIcon } from "lucide-react";

type Payload = Record<string, any>;

const text = (value: unknown, fallback: string) => (
  value === undefined || value === null || value === "" ? fallback : String(value)
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
  const server = state.wallet?.twakServer ?? {};
  const reasoning = state.reasoning ?? [];
  const cycle = state.cycle ?? {};
  const proofBundle = state.liveProofBundle ?? {};
  const proofSignal = proofBundle.latestReceiptStatus?.submissionProof?.cmcAgentHubSignal
    ?? proofBundle.latestSubmission?.payload?.cmcAgentHubSignal;
  const cmcSignal = cycle.cmcAgentHubSignal ?? state.cmcAgentHubSignal ?? proofSignal;
  const cmcProof = cmcSignal ?? cycle.cmcAgentHub ?? state.cmcAgentHub;
  const cmcReady = hasLivePrice(state.prices);
  const cmcToolReady = cmcProof?.ready === true;
  const rows = [
    { label: "market", value: cmcReady ? "CMC live" : "blocked", ok: cmcReady },
    { label: "agent hub", value: cmcSignal ? (cmcToolReady ? "tool call" : "blocked") : "standby", ok: cmcToolReady },
    { label: "policy", value: risk.guardrailsPass ? "pass" : "standby", ok: risk.guardrailsPass === true },
    { label: "signer", value: server.walletBound ? "bound" : text(server.state, "dry"), ok: server.walletBound === true },
    { label: "action", value: decision({ offline, paused, riskPass: risk.guardrailsPass === true, canExecute: simulation.canExecute === true }), ok: !offline && !paused && simulation.canExecute === true },
  ];
  const tools = cycle.toolsUsed ?? state.toolsUsed ?? ["bnb_agent_cockpit_snapshot"];

  return (
    <section className="robot-core-panel flex min-h-0 flex-col overflow-hidden p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <BrainCircuitIcon className="h-4 w-4 text-cyan-200/80" />
          Agent Reasoning
        </h3>
        <ActivityIcon className="h-4 w-4 text-bnb-gold" />
      </div>
      <div className="grid gap-1.5">
        {rows.map(item => (
          <div key={item.label} className="grid grid-cols-[64px_1fr] items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-2 py-1.5">
            <span className="text-[10px] uppercase text-white/36">{item.label}</span>
            <strong className={`truncate text-sm ${item.ok ? "text-cyan-100" : "text-white/58"}`}>{item.value}</strong>
          </div>
        ))}
      </div>
      {reasoning.length ? (
        <div className="mt-2 min-h-0 overflow-hidden border-t border-white/10 pt-2">
          <p className="mb-1 text-[10px] uppercase text-white/32">AI trace</p>
          <div className="space-y-1">
            {reasoning.slice(0, 3).map((item: string) => (
              <p key={item} className="truncate rounded-sm bg-white/[0.025] px-1.5 py-1 text-[10px] text-white/46">
                {item}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      {cmcProof ? <CmcSignalProof signal={cmcProof} /> : null}
      <div className="mt-2 min-h-0 overflow-hidden border-t border-white/10 pt-2">
        <p className="mb-1 text-[10px] uppercase text-white/32">MCP tools used</p>
        <div className="flex flex-wrap gap-1">
          {tools.slice(0, 5).map((tool: string) => (
            <span key={tool} className="rounded-sm border border-bnb-gold/18 bg-bnb-gold/[0.055] px-1.5 py-0.5 font-mono text-[9px] text-bnb-gold/90">
              {tool}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function CmcSignalProof({ signal }: { signal: Payload }) {
  const toolCount = Number(signal.toolCount);
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-cyan-200/12 bg-cyan-200/[0.035] p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase text-cyan-100/52">CMC Agent Hub MCP</p>
        <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase ${signal.ready ? "border-cyan-200/22 text-cyan-100" : "border-white/10 text-white/42"}`}>
          {signal.ready ? signalLabel(signal) : "blocked"}
        </span>
      </div>
      <p className="truncate font-mono text-[10px] text-white/58">{text(signal.toolName, toolCount > 0 ? `${toolCount} tools discovered` : "no signal tool configured")}</p>
      <p className="mt-1 truncate text-[10px] text-white/38">
        {signal.ready ? summarizeParsedContent(signal.parsedContent) : text(signal.reason, "waiting for CMC key")}
      </p>
    </div>
  );
}

function signalLabel(signal: Payload) {
  if (signal.resolution === "auto_discovered") return "auto";
  if (signal.resolution === "pinned") return "pinned";
  return "ready";
}

function summarizeParsedContent(value: unknown) {
  if (!value) return "tool returned live content";
  if (Array.isArray(value) && value.length) {
    const first = value[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") return Object.keys(first).slice(0, 4).join(" / ");
  }
  if (typeof value === "object") return Object.keys(value).slice(0, 4).join(" / ");
  return String(value);
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
