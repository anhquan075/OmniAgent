import AgentActivityConsole from './agent-activity-console';
import LoopStatusPanel from './loop-status';
import PolicyGateSummary from './policy-gate-summary';
import ReceiptFlowTimeline from './receipt-flow-timeline';
import RecoveryQueue from './recovery-queue';
import type { Payload, SourceState } from './flight-deck-model';

export default function CockpitTab({
  runtime,
  bundle,
  refreshedAt,
  sourceState,
  isLoading,
  error,
}: {
  runtime?: Payload;
  bundle?: Payload;
  refreshedAt: string;
  sourceState: SourceState;
  isLoading?: boolean;
  error?: string | null;
}) {
  return (
    <div className="cockpit-tab">
      <ReceiptFlowTimeline bundle={bundle} sourceState={sourceState} />
      <div className="cockpit-grid">
        <div className="cockpit-primary">
          <AgentActivityConsole
            runtime={runtime}
            bundle={sourceState === 'live' ? bundle : {}}
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
