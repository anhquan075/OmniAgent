import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../../lib/api';
import { useCasperDashboardActions } from './casper-dashboard-actions';
import { fallbackSnapshot, type DashboardSnapshot, type Payload } from './dashboard-fallback';
import CockpitTab from './cockpit-tab';
import FlightDeckShell from './flight-deck-shell';
import ProofPacketTab from './proof-packet-tab';
import ReceiptLedgerTab from './receipt-ledger-tab';

export default function CasperAgentDashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(fallbackSnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState('');

  const loadSnapshot = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiFetch('/api/dashboard/snapshot?limit=8');
      if (!response.ok) throw new Error(`snapshot ${response.status}`);
      setSnapshot(await response.json());
      setRefreshedAt(new Date().toISOString());
      setError(null);
    } catch (err) {
      if (!silent) setSnapshot(fallbackSnapshot);
      setError(err instanceof Error ? err.message : 'snapshot unavailable');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
    const interval = window.setInterval(() => void loadSnapshot({ silent: true }), 8_000);
    return () => window.clearInterval(interval);
  }, [loadSnapshot]);
  const { actionBusy, actionStatus, runCycle, startLoop, stopLoop } = useCasperDashboardActions(loadSnapshot);

  const runtime = snapshot.casperAgentRuntime ?? fallbackSnapshot.casperAgentRuntime ?? {};
  const loopStatus = runtime?.loopStatus ?? {};
  const bundle = snapshot.casperProofBundle ?? fallbackSnapshot.casperProofBundle ?? {};
  const health = snapshot.backendHealth ?? fallbackSnapshot.backendHealth ?? {};
  const sourceState = error ? 'fallback' : refreshedAt ? 'live' : loading ? 'loading' : 'fallback';
  const liveBundle = sourceState === 'live' ? bundle : {};

  return (
    <div className="casper-dashboard">
      <FlightDeckShell
        runtime={runtime}
        bundle={liveBundle}
        health={health}
        sourceState={sourceState}
        loading={loading}
        refreshedAt={refreshedAt}
        onRefresh={() => void loadSnapshot()}
        cockpit={<CockpitTab
          runtime={{ ...runtime, loopStatus }}
          bundle={liveBundle}
          refreshedAt={refreshedAt}
          sourceState={sourceState}
          isLoading={loading}
          error={error}
          actionStatus={actionStatus}
          actionBusy={actionBusy}
          onRunCycle={runCycle}
          onStart={startLoop}
          onStop={stopLoop}
        />}
        proof={<ProofPacketTab runtime={runtime} bundle={liveBundle} sourceState={sourceState} />}
        ledger={<ReceiptLedgerTab bundle={liveBundle} refreshKey={refreshedAt} />}
      />
    </div>
  );
}
