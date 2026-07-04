import { useCallback, useEffect, useRef, useState } from 'react';

import { apiEventSource, apiFetch } from '../../lib/api';
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
  const hasLiveSnapshotRef = useRef(false);

  const applySnapshot = useCallback((nextSnapshot: DashboardSnapshot) => {
    setSnapshot(nextSnapshot);
    setRefreshedAt(new Date().toISOString());
    setError(null);
    setLoading(false);
    hasLiveSnapshotRef.current = true;
  }, []);

  const loadSnapshot = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiFetch('/api/dashboard/snapshot?limit=8');
      if (!response.ok) throw new Error(`snapshot ${response.status}`);
      applySnapshot(await response.json());
    } catch (err) {
      if (!silent) setSnapshot(fallbackSnapshot);
      setError(err instanceof Error ? err.message : 'snapshot unavailable');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    void loadSnapshot();
    let closed = false;
    let source: EventSource | null = null;
    let fallbackInterval: number | null = null;

    const startFallbackPolling = () => {
      if (fallbackInterval !== null) return;
      fallbackInterval = window.setInterval(() => void loadSnapshot({ silent: true }), 8_000);
    };

    const stopFallbackPolling = () => {
      if (fallbackInterval === null) return;
      window.clearInterval(fallbackInterval);
      fallbackInterval = null;
    };

    const openStream = async () => {
      try {
        source = await apiEventSource('/api/dashboard/stream?limit=8');
        source.addEventListener('open', stopFallbackPolling);
        source.addEventListener('dashboard_snapshot', (event) => {
          applySnapshot(JSON.parse((event as MessageEvent).data));
          stopFallbackPolling();
        });
        source.addEventListener('dashboard_error', (event) => {
          console.warn('Casper dashboard stream error', (event as MessageEvent).data);
        });
        source.addEventListener('error', () => {
          if (closed) return;
          startFallbackPolling();
          if (!hasLiveSnapshotRef.current) {
            setError('stream unavailable');
          }
        });
      } catch (err) {
        if (closed) return;
        startFallbackPolling();
        setError(err instanceof Error ? err.message : 'stream unavailable');
      }
    };

    void openStream();

    return () => {
      closed = true;
      stopFallbackPolling();
      source?.close();
    };
  }, [applySnapshot, loadSnapshot]);

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
        />}
        proof={<ProofPacketTab runtime={runtime} bundle={liveBundle} sourceState={sourceState} />}
        ledger={<ReceiptLedgerTab bundle={liveBundle} refreshKey={refreshedAt} />}
      />
    </div>
  );
}
