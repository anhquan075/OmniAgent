import { BookOpenCheckIcon, ClipboardListIcon, GaugeIcon } from 'lucide-react';

import { sourceStateLabel, type SourceState } from './flight-deck-model';

export type FlightDeckTab = 'cockpit' | 'proof' | 'ledger';

const tabs = [
  { id: 'cockpit' as const, label: 'Cockpit', icon: GaugeIcon },
  { id: 'proof' as const, label: 'Proof Packet', icon: BookOpenCheckIcon },
  { id: 'ledger' as const, label: 'Receipt Ledger', icon: ClipboardListIcon },
];

export default function FlightDeckRail({
  activeTab,
  onTabChange,
  sourceState,
  refreshedAt,
}: {
  activeTab: FlightDeckTab;
  onTabChange: (tab: FlightDeckTab) => void;
  sourceState: SourceState;
  refreshedAt: string;
}) {
  return (
    <aside className="flight-rail" aria-label="Flight Deck navigation">
      <div className="flight-brand">
        <img src="/imgs/casper-icon.png" alt="OmniAgent mascot" width="66" height="66" />
        <div>
          <b>OmniAgent</b>
          <span>Casper</span>
        </div>
      </div>
      <nav className="flight-tabs" aria-label="Receipt Flight Deck tabs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? 'is-active' : ''}
            aria-current={activeTab === id ? 'page' : undefined}
            onClick={() => onTabChange(id)}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>
      <div className="flight-rail-status">
        <span className={sourceState === 'live' ? 'is-ok' : sourceState === 'loading' ? 'is-loading' : 'is-blocked'} />
        <b>{sourceStateLabel(sourceState)}</b>
        <small>Last sync: {refreshedAt ? new Date(refreshedAt).toISOString().slice(11, 19) : 'pending'} UTC</small>
        <a className="flight-rail-try" href="/try">
          Try enforcement
        </a>
      </div>
    </aside>
  );
}
