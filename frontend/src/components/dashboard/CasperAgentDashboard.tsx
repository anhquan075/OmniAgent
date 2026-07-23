import { useCallback, useEffect, useRef, useState } from 'react';

import { apiEventSource, apiFetch } from '../../lib/api';
import { fallbackSnapshot, type DashboardSnapshot, type Payload } from './dashboard-fallback';
import CockpitTab from './cockpit-tab';
import FlightDeckShell from './flight-deck-shell';
import ProofPacketTab from './proof-packet-tab';
import ReceiptLedgerTab from './receipt-ledger-tab';

export default function CasperAgentDashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(fallbackSnapshot);
  const [cycleHistory, setCycleHistory] = useState<Payload>({ cycles: [], count: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState('');
  const [streamClockMs, setStreamClockMs] = useState(() => Date.now());
  const hasLiveSnapshotRef = useRef(false);
  const observedLedgerVersionRef = useRef<string | null | undefined>(undefined);
  const cycleHistoryRequestRef = useRef(0);

  const loadCycleHistory = useCallback(async () => {
    const requestId = cycleHistoryRequestRef.current + 1;
    cycleHistoryRequestRef.current = requestId;
    try {
      const response = await apiFetch('/api/dashboard/cycles?limit=8');
      if (!response.ok) throw new Error(`cycles ${response.status}`);
      const payload = await response.json();
      if (cycleHistoryRequestRef.current === requestId) {
        setCycleHistory(payload && typeof payload === 'object' ? payload : { cycles: [], count: 0, total: 0 });
      }
    } catch (err) {
      if (cycleHistoryRequestRef.current === requestId) {
        console.warn('Casper cycle history unavailable', err);
      }
    }
  }, []);

  const applySnapshot = useCallback((nextSnapshot: DashboardSnapshot) => {
    const rawLedgerVersion = nextSnapshot.casperProofBundle?.ledger?.latestEventId
      ?? nextSnapshot.casperProofBundle?.ledger?.eventCount;
    const nextLedgerVersion = rawLedgerVersion === undefined || rawLedgerVersion === null
      ? null
      : String(rawLedgerVersion);
    if (observedLedgerVersionRef.current === undefined) {
      observedLedgerVersionRef.current = nextLedgerVersion;
      void loadCycleHistory();
    } else if (observedLedgerVersionRef.current !== nextLedgerVersion) {
      observedLedgerVersionRef.current = nextLedgerVersion;
      void loadCycleHistory();
    }
    setSnapshot(nextSnapshot);
    setRefreshedAt(new Date().toISOString());
    setError(null);
    setLoading(false);
    hasLiveSnapshotRef.current = true;
  }, [loadCycleHistory]);

  const loadSnapshot = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await apiFetch('/api/dashboard/snapshot?limit=8');
      if (!response.ok) throw new Error(`snapshot ${response.status}`);
      applySnapshot(await response.json());
    } catch (err) {
      // Quarantine proof UI via `error`, but keep the last good snapshot when we
      // already had live data so a refresh spinner does not flash empty fallback.
      if (!silent && !hasLiveSnapshotRef.current) {
        setSnapshot(fallbackSnapshot);
      }
      setError(err instanceof Error ? err.message : 'snapshot unavailable');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    void loadSnapshot();
    void loadCycleHistory();
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
  }, [applySnapshot, loadCycleHistory, loadSnapshot]);

  useEffect(() => {
    const timer = window.setInterval(() => setStreamClockMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const runtime = snapshot.casperAgentRuntime ?? fallbackSnapshot.casperAgentRuntime ?? {};
  const loopStatus = runtime?.loopStatus ?? {};
  const bundle = snapshot.casperProofBundle ?? fallbackSnapshot.casperProofBundle ?? {};
  const health = snapshot.backendHealth ?? fallbackSnapshot.backendHealth ?? {};
  const sourceState = error ? 'fallback' : refreshedAt ? 'live' : loading ? 'loading' : 'fallback';
  const liveBundle = sourceState === 'live' ? bundle : {};
  const streamMeta = sourceState === 'live' ? snapshot.streamMeta : undefined;

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
          cycleHistory={cycleHistory}
          streamMeta={streamMeta}
          streamClockMs={streamClockMs}
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
