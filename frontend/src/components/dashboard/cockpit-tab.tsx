import AgentActivityConsole from './agent-activity-console';
import LoopStatusPanel from './loop-status';
import PolicyGateSummary from './policy-gate-summary';
import ProofOutcomePanel from './proof-outcome-panel';
import ReceiptFlowTimeline from './receipt-flow-timeline';
import RecoveryQueue from './recovery-queue';
import type { Payload, SourceState } from './flight-deck-model';

export default function CockpitTab({
  runtime,
  bundle,
  cycleHistory,
  streamMeta,
  streamClockMs,
  refreshedAt,
  sourceState,
  isLoading,
  error,
}: {
  runtime?: Payload;
  bundle?: Payload;
  cycleHistory?: Payload;
  streamMeta?: Payload;
  streamClockMs?: number;
  refreshedAt: string;
  sourceState: SourceState;
  isLoading?: boolean;
  error?: string | null;
}) {
  const liveBundle = sourceState === 'live' ? bundle : {};
  return (
    <div className="cockpit-tab">
      <div className="cockpit-header">
        <ProofOutcomePanel bundle={liveBundle} sourceState={sourceState} />
        <ReceiptFlowTimeline bundle={bundle} sourceState={sourceState} />
      </div>
      <div className="cockpit-workbench">
        <div className="cockpit-primary">
          <AgentActivityConsole
            runtime={runtime}
            bundle={liveBundle}
            cycleHistory={cycleHistory}
            streamMeta={streamMeta}
            streamClockMs={streamClockMs}
            refreshedAt={refreshedAt}
            isLoading={isLoading}
            error={error}
          />
        </div>
        <aside className="cockpit-side">
          <LoopStatusPanel loopStatus={runtime?.loopStatus} />
          <PolicyGateSummary bundle={liveBundle} />
          <RecoveryQueue bundle={liveBundle} sourceState={sourceState} />
        </aside>
      </div>
    </div>
  );
}
