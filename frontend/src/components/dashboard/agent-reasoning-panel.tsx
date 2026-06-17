import { BrainCircuitIcon } from "lucide-react";
import AgentVerdictSummary from "./agent-verdict-summary";
import {
  buildAgentOutputReasoning,
  buildMcpCallLog,
} from "./agent-reasoning-json";
import { MarketSignalProof } from "./market-signal-proof";
import { ReasoningJsonPanel } from "./reasoning-json-panel";
import {
  blockerLabel,
  decision,
  hasLivePrice,
  MARKET_HUB_KEY,
  MARKET_SIGNAL_KEY,
  safeVisibleText,
  signalGateLabel,
  signalGateReason,
  SIGNER_SERVER_KEY,
  strategyLabel,
  text,
  toolDisplayName,
  type Payload,
} from "./agent-reasoning-utils";
import LiveEvidenceDrawer from "./live-evidence-drawer";
import { advisoryEvidence, toolEvidence } from "./live-evidence";

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
  const reasoning = Array.isArray(state.reasoning) ? state.reasoning : [];
  const cycle = state.cycle ?? {};
  const strategy = cycle.strategyDecision ?? state.strategyDecision;
  const strategyDecision = strategy?.decision ?? {};
  const proofBundle = state.liveProofBundle ?? {};
  const backendLoop = state.backendHealth?.autonomousLoop ?? {};
  const preflight = state.livePreflight ?? {};
  const proofScore = proofBundle.proofScore ?? state.workOrders?.proofScore ?? {};
  const research = state.strategyResearch ?? state.bnbAgentRuntime?.strategyResearch ?? {};
  const advisoryPanels = Array.isArray(research.panels) ? research.panels : [];
  const strategyTrace = strategyDecision.rationale ? [
    `${text(strategyDecision.action, "hold")} ${Math.round(Number(strategyDecision.confidence ?? 0) * 100)}%: ${strategyDecision.rationale}`,
    ...(strategyDecision.risks ?? []).slice(0, 2),
  ] : [];
  const stageTrace = Array.isArray(cycle.stages)
    ? cycle.stages.slice(0, 3).map((stage: Payload) => (
      `${text(stage.stage, "agent")}: ${text(stage.note ?? stage.reason ?? stage.state ?? stage.tool, "running")}`
    ))
    : [];
  const proofSignal = proofBundle.latestReceiptStatus?.submissionProof?.[MARKET_SIGNAL_KEY]
    ?? proofBundle.latestSubmission?.payload?.[MARKET_SIGNAL_KEY];
  const marketSignal = cycle[MARKET_SIGNAL_KEY] ?? state[MARKET_SIGNAL_KEY] ?? preflight[MARKET_SIGNAL_KEY] ?? proofSignal;
  const marketProof = marketSignal ?? cycle[MARKET_HUB_KEY] ?? state[MARKET_HUB_KEY];
  const signalBlocker = signalGateReason(preflight, marketSignal);
  const marketToolReady = marketProof?.ready === true && !signalBlocker;
  const marketReady = hasLivePrice(state.prices) || marketToolReady;
  const policyReady = preflight.readyForLiveTrade === true || proofScore.checks?.riskPolicyApproved === true || risk.guardrailsPass === true;
  const signerReady = server.walletBound === true || state.wallet?.twakServer?.walletBound === true || state.twakStatus?.walletValidated === true || state.twakStatus?.ready === true;
  const loopEnabled = backendLoop.enabled === true || state.backendHealth?.autonomousLoopEnabled === true;
  const loopDryRun = backendLoop.execute === false;
  const actionReady = !offline && loopEnabled;
  const fallbackTrace = [
    `backend loop ${text(backendLoop.phase ?? backendLoop.state, loopEnabled ? "monitoring" : "syncing")}${loopDryRun ? " / dry run" : ""}`,
    signalBlocker ? `agent hub: ${signalBlocker}` : "",
    preflight.readyForLiveTrade ? "policy precheck ready for backend gate" : `policy precheck guarded: ${blockerLabel(preflight.blockers)}`,
    proofScore.hardBlockers?.length ? `proof blockers: ${proofScore.hardBlockers.slice(0, 3).join(", ")}` : "proof bundle watching BSC evidence",
  ].filter(Boolean);
  const agentLogTrace = [...stageTrace, ...strategyTrace, ...reasoning].filter(Boolean);
  const trace = agentLogTrace.length ? agentLogTrace : fallbackTrace;
  const rows = [
    { label: "market", value: marketReady ? "market live" : "market sync", ok: marketReady },
    { label: "agent hub", value: signalGateLabel(marketSignal, signalBlocker), ok: marketToolReady },
    { label: "strategy", value: strategyLabel(strategyDecision, signalBlocker), ok: strategyDecision.action && strategyDecision.action !== "hold" && !signalBlocker },
    { label: "policy", value: policyReady ? "pass" : "guarded", ok: policyReady },
    { label: "signer", value: signerReady ? "bound" : text(server.state, "dry"), ok: signerReady },
    { label: "action", value: loopDryRun ? "dry run" : decision({ offline, paused, riskPass: policyReady, canExecute: simulation.canExecute === true || preflight.readyForLiveTrade === true }), ok: actionReady },
  ];
  const readyCount = rows.filter(item => item.ok).length;
  const tools = dedupeTools([
    marketSignal?.toolName,
    ...(cycle.toolsUsed ?? state.toolsUsed ?? []),
    marketReady ? "market_signal" : "agent_snapshot",
    signerReady ? "twak_rest_bridge" : "signer_status",
    proofBundle.latestReceiptStatus ? "bsc_receipt_proof" : "proof_bundle",
    loopEnabled ? "autonomous_loop" : "policy_monitor",
    "agent_snapshot",
  ]);
  const agentOutputReasoning = buildAgentOutputReasoning({
    state,
    rows,
    trace,
    readyCount,
    offline,
    paused,
  });
  const mcpCallLog = buildMcpCallLog(state, tools);

  return (
    <section className="robot-core-panel agent-reasoning-panel flex min-h-0 flex-col overflow-x-hidden overflow-y-auto p-3">
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
      {marketProof ? <MarketSignalProof signal={marketProof} /> : null}
      {advisoryPanels.length ? (
        <div className="reasoning-advisory-grid" aria-label="Advisory strategy research">
          {advisoryPanels.slice(0, 4).map((item: Payload) => (
            <details key={text(item.role, "advisor")} className={`reasoning-advisory-card is-${text(item.role, "advisor")}`}>
              <summary>
                <div>
                  <span>{text(item.role, "advisor").replace(/_/g, " ")}</span>
                  <b>{Math.round(Number(item.confidence ?? 0) * 100)}%</b>
                </div>
                <strong>{text(item.stance, "advisory")}</strong>
                <p>{safeVisibleText(text((item.evidence ?? [])[0], "Advisory only; backend policy controls execution."))}</p>
              </summary>
              <LiveEvidenceDrawer evidence={advisoryEvidence(item, state)} />
            </details>
          ))}
        </div>
      ) : null}
      {trace.length ? (
        <div className="reasoning-trace-block" aria-label="Agent log reasoning">
          <p>{agentLogTrace.length ? "Agent log reasoning" : research.mode ? "advisory trace" : strategy?.advisor?.ready ? "model trace" : "strategy trace"}</p>
          <div className="space-y-1">
            {trace.slice(0, 5).map((item: string, index: number) => (
              <p key={`${index}-${item}`} className="reasoning-trace-line">
                {safeVisibleText(item)}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      <ReasoningJsonPanel agentOutput={agentOutputReasoning} mcpLog={mcpCallLog} />
      <div className="reasoning-tools-block">
        <p>Tools used</p>
        <div>
          {tools.slice(0, 6).map((tool: string) => (
            <details key={tool} className="reasoning-tool-detail">
              <summary className="reasoning-tool-chip">
                {toolDisplayName(tool)}
              </summary>
              <LiveEvidenceDrawer evidence={toolEvidence(tool, state)} />
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export default AgentReasoningPanel;

function dedupeTools(values: unknown[]) {
  const seen = new Set<string>();
  return values
    .flat()
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}
