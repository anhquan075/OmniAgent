import { FileJsonIcon } from 'lucide-react';

import { streamPanelStatus, type McpActivityRow, type Payload } from './agent-activity-model';
import { proofLabel } from './proof-labels';

export default function McpActivityLog({
  rows,
  streamMeta,
  streamClockMs,
}: {
  rows: McpActivityRow[];
  streamMeta?: Payload;
  streamClockMs?: number;
}) {
  const stream = streamPanelStatus(streamMeta, streamClockMs);
  return (
    <section className="mcp-log-panel" aria-label="MCP activity log">
      <div className="panel-head">
        <FileJsonIcon className="h-4 w-4" />
        <h3>MCP activity log</h3>
        <span className={`stream-live-meta ${stream.isLive ? 'is-live' : ''}`}>
          <b>{stream.label}</b>
          <small>{stream.sequence} · {stream.emittedAt}</small>
        </span>
      </div>
      <ol className="mcp-log-list">
        {rows.map(row => (
          <li key={row.tool} className={statusClassName(row.status)} data-mcp-tool={row.tool} data-status={row.status}>
            <div>
              <code>{row.tool}</code>
              <span>{proofLabel(row.status, { stripCasperPrefix: true })}</span>
            </div>
            <pre>{row.output}</pre>
          </li>
        ))}
      </ol>
    </section>
  );
}

function statusClassName(status: string) {
  const normalized = status.toLowerCase();
  if (['ready', 'verified', 'confirmed', 'complete', 'approved'].some(item => normalized.includes(item))) return 'is-ok';
  if (normalized.includes('blocked') || normalized.includes('guarded')) return 'is-blocked';
  if (normalized.includes('fail') || normalized.includes('mismatch')) return 'is-fail';
  return 'is-pending';
}
