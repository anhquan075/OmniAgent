import { mcpActivityRows, type Payload } from './agent-activity-model';
import AgentLoopMascot from './agent-loop-mascot';
import AiOutputPanel from './ai-output-panel';
import McpActivityLog from './mcp-activity-log';

type AgentActivityConsoleProps = {
  runtime?: Payload;
  bundle?: Payload;
  streamMeta?: Payload;
  streamClockMs?: number;
  refreshedAt?: string;
  isLoading?: boolean;
  error?: string | null;
};

export default function AgentActivityConsole({
  runtime,
  bundle,
  streamMeta,
  streamClockMs,
  refreshedAt,
  isLoading,
  error,
}: AgentActivityConsoleProps) {
  const rows = mcpActivityRows(runtime, bundle);

  return (
    <div className="agent-activity-console">
      <AgentLoopMascot bundle={bundle} refreshedAt={refreshedAt} isLoading={isLoading} error={error} />
      <div className="agent-stream-grid">
        <McpActivityLog rows={rows} streamMeta={streamMeta} streamClockMs={streamClockMs} />
        <AiOutputPanel bundle={bundle} streamMeta={streamMeta} streamClockMs={streamClockMs} />
      </div>
    </div>
  );
}
