import { useState, type ReactNode } from 'react';

import type { Payload, SourceState } from './flight-deck-model';
import FlightDeckRail, { type FlightDeckTab } from './flight-deck-rail';
import FlightDeckStatusStrip from './flight-deck-status-strip';

export default function FlightDeckShell({
  runtime,
  bundle,
  health,
  sourceState,
  loading,
  refreshedAt,
  onRefresh,
  cockpit,
  proof,
  ledger,
}: {
  runtime?: Payload;
  bundle?: Payload;
  health?: Payload;
  sourceState: SourceState;
  loading?: boolean;
  refreshedAt: string;
  onRefresh: () => void;
  cockpit: ReactNode;
  proof: ReactNode;
  ledger: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<FlightDeckTab>('cockpit');
  const content = { cockpit, proof, ledger }[activeTab];
  return (
    <div className="flight-deck">
      <FlightDeckRail
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sourceState={sourceState}
        refreshedAt={refreshedAt}
      />
      <div className="flight-main">
        <FlightDeckStatusStrip
          runtime={runtime}
          bundle={bundle}
          health={health}
          sourceState={sourceState}
          loading={loading}
          onRefresh={onRefresh}
        />
        <main className="flight-tab-panel" aria-live="polite">
          {content}
        </main>
      </div>
    </div>
  );
}
