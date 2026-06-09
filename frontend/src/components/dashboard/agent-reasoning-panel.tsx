import { BrainCircuitIcon } from "lucide-react";
import AgentVerdictSummary from "./agent-verdict-summary";
import {
  blockerLabel,
  decision,
  hasLivePrice,
  MARKET_HUB_KEY,
  MARKET_SIGNAL_KEY,
  safeVisibleText,
  signalLabel,
  SIGNER_SERVER_KEY,
  strategyLabel,
  summarizeParsedContent,
  text,
  toolDisplayName,
  type Payload,
} from "./agent-reasoning-utils";

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
  const proofBundle = state.liveProofBundle ?? {};
  const backendLoop = state.backendHealth?.autonomousLoop ?? {};
  const preflight = state.livePreflight ?? {};
  const proofScore = proofBundle.proofScore ?? state.workOrders?.proofScore ?? {};
  const strategyTrace = strategyDecision.rationale ? [
    `${text(strategyDecision.action, "hold")} ${Math.round(Number(strategyDecision.confidence ?? 0) * 100)}%: ${strategyDecision.rationale}`,
    ...(strategyDecision.risks ?? []).slice(0, 2),
  ] : [];
  const proofSignal = proofBundle.latestReceiptStatus?.submissionProof?.[MARKET_SIGNAL_KEY]
    ?? proofBundle.latestSubmission?.payload?.[MARKET_SIGNAL_KEY];
  const marketSignal = cycle[MARKET_SIGNAL_KEY] ?? state[MARKET_SIGNAL_KEY] ?? proofSignal;
  const marketProof = marketSignal ?? cycle[MARKET_HUB_KEY] ?? state[MARKET_HUB_KEY];
  const marketToolReady = marketProof?.ready === true;
  const marketReady = hasLivePrice(state.prices) || marketToolReady;
  const policyReady = preflight.readyForLiveTrade === true || proofScore.checks?.riskPolicyApproved === true || risk.guardrailsPass === true;
  const signerReady = server.walletBound === true || state.wallet?.twakServer?.walletBound === true || state.twakStatus?.walletValidated === true || state.twakStatus?.ready === true;
  const loopEnabled = backendLoop.enabled === true || state.backendHealth?.autonomousLoopEnabled === true;
  const loopDryRun = backendLoop.execute === false;
  const actionReady = !offline && loopEnabled;
  const fallbackTrace = [
    `backend loop ${text(backendLoop.phase ?? backendLoop.state, loopEnabled ? "monitoring" : "syncing")}${loopDryRun ? " / dry run" : ""}`,
    preflight.readyForLiveTrade ? "live preflight ready for backend policy gate" : `preflight guarded: ${blockerLabel(preflight.blockers)}`,
    proofScore.hardBlockers?.length ? `proof blockers: ${proofScore.hardBlockers.slice(0, 3).join(", ")}` : "proof bundle watching BSC evidence",
  ];
  const trace = reasoning.length ? reasoning : strategyTrace.length ? strategyTrace : fallbackTrace;
  const rows = [
    { label: "market", value: marketReady ? "market live" : "market sync", ok: marketReady },
    { label: "agent hub", value: marketSignal ? (marketToolReady ? "tool call" : "tool sync") : "monitoring", ok: marketToolReady },
    { label: "strategy", value: strategyLabel(strategyDecision), ok: strategyDecision.action && strategyDecision.action !== "hold" },
    { label: "policy", value: policyReady ? "pass" : "guarded", ok: policyReady },
    { label: "signer", value: signerReady ? "bound" : text(server.state, "dry"), ok: signerReady },
    { label: "action", value: loopDryRun ? "dry run" : decision({ offline, paused, riskPass: policyReady, canExecute: simulation.canExecute === true || preflight.readyForLiveTrade === true }), ok: actionReady },
  ];
  const readyCount = rows.filter(item => item.ok).length;
  const tools = cycle.toolsUsed ?? state.toolsUsed ?? [marketReady ? "market_signal" : "agent_snapshot", signerReady ? "twak_rest_bridge" : "signer_status", loopEnabled ? "autonomous_loop" : "policy_monitor"];

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
          {signal.ready ? signalLabel(signal) : "syncing"}
        </span>
      </div>
      <p className="truncate font-mono text-[10px] text-white/58">{toolDisplayName(signal.toolName ?? (toolCount > 0 ? `${toolCount} tools discovered` : "no signal tool configured"))}</p>
      <p className="mt-1 truncate text-[10px] text-white/38">
        {signal.ready ? summarizeParsedContent(signal.parsedContent) : text(signal.reason, "market key sync")}
      </p>
    </div>
  );
}

export default AgentReasoningPanel;
