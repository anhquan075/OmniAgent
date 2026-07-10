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
  return (
    <div className="cockpit-tab">
      <ProofOutcomePanel bundle={sourceState === 'live' ? bundle : {}} sourceState={sourceState} />
      <ReceiptFlowTimeline bundle={bundle} sourceState={sourceState} />
      <div className="cockpit-grid">
        <div className="cockpit-primary">
          <AgentActivityConsole
            runtime={runtime}
            bundle={sourceState === 'live' ? bundle : {}}
            cycleHistory={cycleHistory}
            streamMeta={streamMeta}
            streamClockMs={streamClockMs}
            refreshedAt={refreshedAt}
            isLoading={isLoading}
            error={error}
          />
          <PolicyGateSummary bundle={sourceState === 'live' ? bundle : {}} />
        </div>
        <aside className="cockpit-side">
          <LoopStatusPanel loopStatus={runtime?.loopStatus} />
          <RecoveryQueue bundle={sourceState === 'live' ? bundle : {}} sourceState={sourceState} />
        </aside>
      </div>
    </div>
  );
}
