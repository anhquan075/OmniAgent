import {
  MARKET_HUB_KEY,
  MARKET_SIGNAL_KEY,
  type Payload,
} from "./agent-reasoning-utils";

type GateRow = { label: string; value: string; ok: boolean };

export function buildAgentOutputReasoning({
  state,
  rows,
  trace,
  readyCount,
  offline,
  paused,
}: {
  state: Payload;
  rows: GateRow[];
  trace: string[];
  readyCount: number;
  offline: boolean;
  paused: boolean;
}) {
  const cycle = state.cycle ?? {};
  const proofBundle = state.liveProofBundle ?? {};
  const preflight = state.livePreflight ?? {};
  const research = state.strategyResearch ?? state.bnbAgentRuntime?.strategyResearch ?? {};
  const strategy = cycle.strategyDecision ?? state.strategyDecision ?? {};
  return compact({
    status: cycle.status ?? proofBundle.status ?? preflight.status ?? "unknown",
    decision: strategy.decision ?? {},
    why: trace,
    gates: {
      ready: readyCount,
      total: rows.length,
      rows,
      offline,
      paused,
    },
    livePreflight: pick(preflight, [
      "status",
      "readyToEnableLive",
      "readyForLiveTrade",
      "blockers",
      "checks",
      "fundedStrategy",
    ]),
    proofScore: proofBundle.proofScore ?? state.workOrders?.proofScore,
    market: pick(state.prices, ["source", "configured", "reachable", "timestamp", "reason", "quotaLimited", "retryAfterSec"]),
    marketSignal: pick(cycle[MARKET_SIGNAL_KEY] ?? state[MARKET_SIGNAL_KEY] ?? preflight[MARKET_SIGNAL_KEY], [
      "source",
      "ready",
      "reachable",
      "configured",
      "toolName",
      "resolution",
      "reason",
      "serverVerified",
      "timestamp",
    ]),
    advisory: pick(research, ["mode", "canExecute", "executor", "finalAdvisory", "safetyBoundary", "panels"]),
    receipt: pick(proofBundle.latestReceiptStatus, ["status", "txHash", "blockNumber", "proof", "submissionProof"]),
  });
}

export function buildMcpCallLog(state: Payload, tools: string[]) {
  const cycle = state.cycle ?? {};
  const preflight = state.livePreflight ?? {};
  const proofBundle = state.liveProofBundle ?? {};
  const signal = cycle[MARKET_SIGNAL_KEY] ?? state[MARKET_SIGNAL_KEY] ?? preflight[MARKET_SIGNAL_KEY];
  const hub = cycle[MARKET_HUB_KEY] ?? state[MARKET_HUB_KEY];
  const stageCalls = Array.isArray(cycle.stages)
    ? cycle.stages.map((stage: Payload) => compact({
      source: "autonomous_cycle",
      stage: stage.stage,
      tool: stage.tool,
      state: stage.state,
      note: stage.note ?? stage.reason,
    }))
    : [];
  const toolCalls = tools.map((tool) => compact({
    source: "dashboard_snapshot",
    tool,
    observed: true,
  }));
  return [
    ...stageCalls,
    compact({
      source: "live_preflight",
      tool: "bnb_live_preflight",
      state: preflight.status,
      readyForLiveTrade: preflight.readyForLiveTrade,
      blockers: preflight.blockers,
    }),
    compact({
      source: "market_signal",
      tool: signal?.toolName ? "cmc_agent_hub_call_tool" : "cmc_agent_hub_status",
      toolName: signal?.toolName,
      ready: signal?.ready,
      reason: signal?.reason,
      parsedContent: signal?.parsedContent,
      hub: pick(hub, ["ready", "reachable", "reason", "toolCount", "timestamp"]),
    }),
    compact({
      source: "proof_bundle",
      tool: "bnb_live_proof_bundle",
      state: proofBundle.status,
      txHash: proofBundle.latestReceiptStatus?.txHash ?? proofBundle.latestSubmission?.txHash,
      proof: proofBundle.latestReceiptStatus?.proof,
    }),
    ...toolCalls,
  ].filter((item) => Object.keys(item).length > 1);
}

export function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function pick(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Payload;
  return compact(Object.fromEntries(keys.map((key) => [key, source[key]])));
}

function compact<T extends Payload>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")
  ) as T;
}
