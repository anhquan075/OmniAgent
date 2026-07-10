import { useCallback, useMemo, useState } from 'react';

import { mcpActivityRows, type Payload } from './agent-activity-model';
import AgentLoopMascot from './agent-loop-mascot';
import AiOutputPanel from './ai-output-panel';
import McpActivityLog from './mcp-activity-log';

type AgentActivityConsoleProps = {
  runtime?: Payload;
  bundle?: Payload;
  cycleHistory?: Payload;
  streamMeta?: Payload;
  streamClockMs?: number;
  refreshedAt?: string;
  isLoading?: boolean;
  error?: string | null;
};

export default function AgentActivityConsole({
  runtime,
  bundle,
  cycleHistory,
  streamMeta,
  streamClockMs,
  refreshedAt,
  isLoading,
  error,
}: AgentActivityConsoleProps) {
  const cycles = useMemo(
    () => (Array.isArray(cycleHistory?.cycles) ? cycleHistory.cycles.filter(isCycleRecord) : []),
    [cycleHistory],
  );
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [pinnedCycle, setPinnedCycle] = useState<Payload | null>(null);
  const selectedCycle = selectedCycleId
    ? cycles.find(cycle => cycle.cycleId === selectedCycleId) ?? pinnedCycle
    : null;
  const visibleCycles = selectedCycleId && pinnedCycle && !cycles.some(cycle => cycle.cycleId === selectedCycleId)
    ? [pinnedCycle, ...cycles]
    : cycles;
  const activeRuntime = selectedCycle?.runtime ?? runtime;
  const activeBundle = selectedCycle?.bundle ?? bundle;
  const historicalStreamMeta = selectedCycle ? {
    ...(selectedCycle.streamMeta && typeof selectedCycle.streamMeta === 'object' ? selectedCycle.streamMeta : {}),
    transport: 'history',
    sequence: selectedCycle.streamMeta?.sequence ?? shortCycleId(selectedCycle.cycleId),
    emittedAt: selectedCycle.streamMeta?.emittedAt ?? selectedCycle.completedAt ?? selectedCycle.startedAt,
  } : streamMeta;
  const rows = mcpActivityRows(activeRuntime, activeBundle);

  const selectCycle = useCallback((cycleId: string) => {
    setSelectedCycleId(cycleId);
    setPinnedCycle(cycleId ? cycles.find(cycle => cycle.cycleId === cycleId) ?? null : null);
  }, [cycles]);

  return (
    <div className="agent-activity-console">
      <AgentLoopMascot bundle={bundle} refreshedAt={refreshedAt} isLoading={isLoading} error={error} />
      <div className="agent-output-column">
        <div className="cycle-history-control" data-cycle-history>
          <div className="cycle-history-field">
            <label htmlFor="autonomous-loop-cycle">Select autonomous loop cycle</label>
            <select
              id="autonomous-loop-cycle"
              value={selectedCycleId}
              onChange={event => selectCycle(event.target.value)}
            >
              <option value="" data-cycle-id="latest-live">Latest live cycle</option>
              {visibleCycles.map(cycle => (
                <option key={cycle.cycleId} value={cycle.cycleId} data-cycle-id={cycle.cycleId}>
                  {cycleOptionLabel(cycle)}
                </option>
              ))}
            </select>
          </div>
          <p className="cycle-history-summary" role="status" aria-live="polite">
            {selectedCycle
              ? `Recorded cycle ${selectedCycle.cycleId} · ${selectedCycle.status || 'complete'} · MCP and AI output pinned.`
              : `Following the latest live MCP and AI output${cycles.length ? ` · ${cycles.length} recorded cycles available.` : '.'}`}
          </p>
        </div>
        <div
          className="agent-stream-grid"
          data-cycle-id={selectedCycle?.cycleId ?? 'latest-live'}
        >
          <McpActivityLog
            rows={rows}
            streamMeta={historicalStreamMeta}
            streamClockMs={streamClockMs}
            cycleId={selectedCycle?.cycleId}
          />
          <AiOutputPanel
            bundle={activeBundle}
            streamMeta={historicalStreamMeta}
            streamClockMs={streamClockMs}
            cycleId={selectedCycle?.cycleId}
          />
        </div>
      </div>
    </div>
  );
}

function isCycleRecord(value: unknown): value is Payload {
  return Boolean(value && typeof value === 'object' && typeof (value as Payload).cycleId === 'string');
}

function cycleOptionLabel(cycle: Payload) {
  const completedAt = String(cycle.completedAt ?? cycle.startedAt ?? '');
  const parsed = Date.parse(completedAt);
  const time = Number.isFinite(parsed) ? `${new Date(parsed).toISOString().slice(11, 19)} UTC` : 'time pending';
  const status = String(cycle.status || 'complete').replaceAll('_', ' ');
  const decisionId = String(cycle.decisionId || cycle.bundle?.latestDecision?.decisionId || 'decision pending');
  return `${time} · ${status} · ${decisionId} · ${shortCycleId(cycle.cycleId)}`;
}

function shortCycleId(value: unknown) {
  const text = typeof value === 'string' ? value : '';
  return text.length > 16 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text || 'cycle';
}
