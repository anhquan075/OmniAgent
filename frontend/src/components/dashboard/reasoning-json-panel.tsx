import { Code2Icon } from "lucide-react";
import { prettyJson } from "./agent-reasoning-json";

export function ReasoningJsonPanel({
  agentOutput,
  mcpLog,
}: {
  agentOutput: unknown;
  mcpLog: unknown;
}) {
  return (
    <div className="reasoning-json-grid" aria-label="Structured agent reasoning">
      <details className="reasoning-json-card" open>
        <summary>
          <Code2Icon className="h-3.5 w-3.5" />
          <span>Agent output JSON</span>
        </summary>
        <pre>{prettyJson(agentOutput)}</pre>
      </details>
      <details className="reasoning-json-card">
        <summary>
          <Code2Icon className="h-3.5 w-3.5" />
          <span>MCP call log JSON</span>
        </summary>
        <pre>{prettyJson(mcpLog)}</pre>
      </details>
    </div>
  );
}
