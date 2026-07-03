import { mcpActivityRows, type Payload } from './agent-activity-model';
import AgentLoopMascot from './agent-loop-mascot';
import AiOutputPanel from './ai-output-panel';
import McpActivityLog from './mcp-activity-log';

type AgentActivityConsoleProps = {
  runtime?: Payload;
  bundle?: Payload;
  refreshedAt?: string;
  isLoading?: boolean;
  error?: string | null;
};

export default function AgentActivityConsole({
  runtime,
  bundle,
  refreshedAt,
  isLoading,
  error,
}: AgentActivityConsoleProps) {
  const rows = mcpActivityRows(runtime, bundle);

  return (
    <div className="agent-activity-console">
      <AgentLoopMascot bundle={bundle} refreshedAt={refreshedAt} isLoading={isLoading} error={error} />
      <div className="agent-stream-grid">
        <McpActivityLog rows={rows} />
        <AiOutputPanel bundle={bundle} />
      </div>
    </div>
  );
}
