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
        <div className="flight-brand-mark">
          <img src="/imgs/casper-icon.png" alt="" width="66" height="66" />
        </div>
        <div>
          <p className="flight-brand-eyebrow">Casper proof console</p>
          <b>OmniAgent</b>
          <span>Enforcement cockpit</span>
        </div>
      </div>
      <nav className="flight-tabs" aria-label="Receipt Flight Deck tabs">
        {tabs.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? 'is-active' : ''}
            aria-current={activeTab === id ? 'page' : undefined}
            onClick={() => onTabChange(id)}
          >
            <span className="flight-tab-index" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="flight-tab-label">{label}</span>
          </button>
        ))}
      </nav>
      <div className="flight-rail-status">
        <div className="flight-rail-status-row">
          <span
            className={
              sourceState === 'live' ? 'is-ok' : sourceState === 'loading' ? 'is-loading' : 'is-blocked'
            }
            aria-hidden="true"
          />
          <b>{sourceStateLabel(sourceState)}</b>
        </div>
        <small>
          Last sync: {refreshedAt ? new Date(refreshedAt).toISOString().slice(11, 19) : 'pending'} UTC
        </small>
      </div>
    </aside>
  );
}
