import { useState, useEffect, useRef } from 'react';
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

export const useRobotFleetEvents = (): UseRobotFleetEventsResult => {
  const [events, setEvents] = useState<RobotEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const connect = () => {
      try {
        const eventSource = new EventSource(getApiUrl('/api/robot-fleet/events'));
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          setIsConnected(true);
          setError(null);
        };

        const handleFleetEvent = (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            
            if (data.type === 'fleet:task-completed' && data.event) {
              const eventData = data.event;
              const iconName = eventData.icon || 'Truck';
              const IconComponent = ICON_MAP[iconName] || Truck;
              
              const formattedEvent = {
                ...eventData,
                icon: IconComponent
              };
              
              addEvent(formattedEvent);
              return;
            }

            if (data.type === 'fleet:status') {
              const statusEvent = {
                ...data,
                icon: ICON_MAP['Delivery'],
                robotId: 'SYSTEM',
                taskName: 'Fleet Status Sync',
                earnings: '0',
                timestamp: new Date().toISOString(),
                type: 'fleet:status'
              };
              addEvent(statusEvent as any);
            }
          } catch (err) {
            console.error('Failed to parse fleet-event message', err);
          }
        };

        eventSource.addEventListener('fleet-event', handleFleetEvent as any);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'connected') {
              console.log('Robot Fleet Stream Connected');
            }
          } catch (e) {}
        };

        eventSource.onerror = (err) => {
          console.error('SSE Error', err);
          setIsConnected(false);
          setError(new Error('Connection lost'));
          eventSource.close();
        };

      } catch (e) {
        console.error('Failed to create EventSource', e);
        setError(e as Error);
      }
    };

    const addEvent = (newEvent: RobotEvent) => {
      setEvents((prev) => {
        const updated = [newEvent, ...prev];
        return updated.slice(0, 50);
      });
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return { events, isConnected, error };
};
