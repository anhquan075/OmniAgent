import { useState, useEffect, useRef, useCallback } from 'react';
import { Truck, Sparkles, Scan, Shield, Radar, Zap, Lock, Eye, Activity, ShieldAlert, Target, LucideIcon } from 'lucide-react';
import { getApiUrl } from '../lib/api';

export interface RobotEvent {
  robotId: string;
  type: string;
  taskName: string;
  earnings: string;
  timestamp: string;
  icon: LucideIcon;
  txHash?: string;
}

interface FleetStatus {
  enabled: boolean;
  robots: Array<{ id: string; type: string; icon: string; status: string; totalEarned: string; taskCount: number }>;
  fleetTotalEarned: string;
  recentEvents: Array<{ robotId: string; type: string; icon: string; taskName: string; earnings: string; timestamp: string; txHash?: string }>;
  latestTxHash?: string | null;
  latestTxValue?: string | null;
}

interface UseRobotFleetEventsResult {
  events: RobotEvent[];
  isConnected: boolean;
  error: Error | null;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Delivery: Truck,
  Cleaning: Sparkles,
  Inspection: Scan,
  "[S]": Shield,
  "[L]": Radar,
  "[A]": Zap,
  "[G]": Lock,
  "[O]": Eye,
  "[D]": Activity,
  "[M]": ShieldAlert,
  "[B]": Target,
};

const POLL_INTERVAL = 5000;

export const useRobotFleetEvents = (): UseRobotFleetEventsResult => {
  const [events, setEvents] = useState<RobotEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const seenTxHashesRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(getApiUrl('/api/robot-fleet/status'), {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const status: FleetStatus = await res.json();

      if (!seenTxHashesRef.current.size) {
        setIsConnected(true);
        setError(null);
        for (const tx of status.recentEvents) {
          if (tx.txHash) seenTxHashesRef.current.add(tx.txHash);
        }
        return;
      }

      const newEvents: RobotEvent[] = [];
      for (const tx of status.recentEvents) {
        if (tx.txHash && !seenTxHashesRef.current.has(tx.txHash)) {
          seenTxHashesRef.current.add(tx.txHash);
          const iconName = tx.icon || 'Truck';
          newEvents.push({
            ...tx,
            icon: ICON_MAP[iconName] || Truck,
          });
        }
      }

      if (newEvents.length > 0) {
        setEvents((prev) => [...newEvents, ...prev].slice(0, 50));
      }

      setIsConnected(true);
      setError(null);
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('abort')) return;
      setIsConnected(false);
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  return { events, isConnected, error };
};
