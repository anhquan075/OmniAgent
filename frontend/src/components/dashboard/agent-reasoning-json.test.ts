import { describe, expect, it } from "vitest";
import { buildAgentOutputReasoning, buildMcpCallLog, prettyJson } from "./agent-reasoning-json";

describe("agent reasoning json", () => {
  it("formats gate reasoning and live blockers as pretty json", () => {
    const output = buildAgentOutputReasoning({
      state: {
        cycle: {
          status: "blocked",
          strategyDecision: { decision: { action: "hold", confidence: 0.35 } },
        },
        livePreflight: {
          status: "blocked",
          blockers: [{ name: "cmc", reason: "quota" }],
        },
      },
      rows: [{ label: "market", value: "market sync", ok: false }],
      trace: ["hold 35%: live_price_missing"],
      readyCount: 0,
      offline: false,
      paused: false,
    });

    expect(output.status).toBe("blocked");
    expect(output.gates.rows[0].label).toBe("market");
    expect(output.livePreflight.blockers[0].name).toBe("cmc");
    expect(prettyJson(output)).toContain('\n  "status": "blocked"');
  });

  it("builds an mcp call log from cycle stages and snapshot tools", () => {
    const log = buildMcpCallLog({
      cycle: {
        stages: [{ stage: "sense", state: "blocked", tool: "cmc_agent_hub_status", note: "quota" }],
      },
      livePreflight: { status: "blocked", readyForLiveTrade: false },
      liveProofBundle: { status: "blocked" },
    }, ["bnb_agent_cockpit_snapshot"]);

    expect(log[0]).toMatchObject({ source: "autonomous_cycle", tool: "cmc_agent_hub_status" });
    expect(log.some((item) => item.tool === "bnb_live_preflight")).toBe(true);
    expect(log.some((item) => item.tool === "bnb_agent_cockpit_snapshot")).toBe(true);
  });
});
