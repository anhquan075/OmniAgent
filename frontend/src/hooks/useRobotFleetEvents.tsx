import { useState, useEffect, useRef } from 'react';
import { Truck, Sparkles, Scan, LucideIcon } from 'lucide-react';
import { getApiUrl } from '../lib/api';

export interface RobotEvent {
  robotId: string;
  type: string;
  taskName: string;
  earnings: string;
  timestamp: string;
  icon: LucideIcon;
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

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const iconName = data.icon || 'Truck';
            const IconComponent = ICON_MAP[iconName] || Truck;
            
            const formattedEvent = {
              ...data,
              icon: IconComponent
            };
            
            addEvent(formattedEvent);
          } catch (e) {
            console.error('Failed to parse SSE message', e);
          }
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
