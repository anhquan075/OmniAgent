import React, { useState, useEffect } from 'react';
import { useRobotFleetEvents } from '../../hooks/useRobotFleetEvents';
import RobotCard from './RobotCard';
import ActivityFeed from './ActivityFeed';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import { ZapIcon, Truck, Sparkles, Scan, Shield, Radar, Zap, Lock, Eye, Activity, ShieldAlert, Target, LucideIcon } from 'lucide-react';
import { getApiUrl } from '../../lib/api';

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

const FleetStatus: React.FC = () => {
  const { events, isConnected, error } = useRobotFleetEvents();
  const [robots, setRobots] = useState<any[]>([]);
  const [fleetTotal, setFleetTotal] = useState('0.0000');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(getApiUrl('/api/robot-fleet/status'));
        if (response.ok) {
          const data = await response.json();
          if (data.robots && Array.isArray(data.robots)) {
            const formattedRobots = data.robots.map((r: any) => {
              const iconName = r.icon || 'Truck';
              return {
                ...r,
                icon: ICON_MAP[iconName] || Truck
              };
            });
            setRobots(formattedRobots);
            setFleetTotal(data.fleetTotalEarned || '0.0000');
            setIsInitialized(true);
          }
        }
      } catch (err) {
        console.error('Failed to fetch initial fleet status', err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (events.length > 0 && isInitialized) {
      const latestEvent = events[0];
      
      if (latestEvent.type === 'fleet:status' || (latestEvent as any).type === 'fleet:status') {
        const data = (latestEvent as any).data || latestEvent;
        if (data.robots) {
          const formattedRobots = data.robots.map((r: any) => {
            const iconName = r.icon || 'Truck';
            return {
              ...r,
              icon: ICON_MAP[iconName] || Truck
            };
          });
          setRobots(formattedRobots);
          setFleetTotal(data.fleetTotalEarned || '0.0000');
        }
        return;
      }

      const eventData = (latestEvent as any).event || latestEvent;
      
      setRobots(prevRobots => {
        const exists = prevRobots.some(r => r.id === eventData.robotId);
        
        if (!exists) {
          const iconName = eventData.icon || 'Truck';
          return [...prevRobots, {
            id: eventData.robotId,
            type: eventData.type || 'Delivery',
            icon: ICON_MAP[iconName] || Truck,
            status: 'Working',
            totalEarned: eventData.earnings || '0.0000'
          }];
        }
        
        return prevRobots.map(robot => {
          if (robot.id === eventData.robotId) {
            const newTotal = (parseFloat(robot.totalEarned || '0') + parseFloat(eventData.earnings || '0')).toFixed(4);
            return {
              ...robot,
              status: 'Working',
              totalEarned: newTotal
            };
          }
          return robot;
        });
      });

      if (eventData.earnings) {
        setFleetTotal(prevTotal => (parseFloat(prevTotal || '0') + parseFloat(eventData.earnings)).toFixed(4));
      }
    }
  }, [events, isInitialized]);

  useEffect(() => {
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn(
            "transition-colors border h-7 px-2.5 text-[10px] font-medium uppercase tracking-wider",
            isConnected 
              ? "bg-neon-green/10 text-neon-green border-neon-green/20" 
              : "bg-red-500/10 text-red-500 border-red-500/20"
          )}>
            <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", isConnected ? "bg-neon-green animate-pulse shadow-[0_0_5px_rgba(74,222,128,0.5)]" : "bg-red-500")} />
            {isConnected ? 'Live' : 'Offline'}
          </Badge>
          {error && <span className="text-[10px] text-red-400">Connection Error</span>}
        </div>
        
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-neutral-gray uppercase tracking-wider mb-0.5">Session Earnings</span>
          <div className="flex items-center gap-1.5 text-tether-teal font-heading font-bold text-2xl leading-none">
            <ZapIcon className="w-4 h-4 fill-current" />
            <span className="animate-in fade-in slide-in-from-top-1 duration-500">{fleetTotal} USDT</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {robots.map(robot => (
          <RobotCard
            key={robot.id}
            {...robot}
          />
        ))}
        {robots.length === 0 && (
          <div className="col-span-3 text-center text-xs text-neutral-gray py-4">
            Waiting for fleet data...
          </div>
        )}
      </div>
      
      <div className="flex-1 min-h-0 bg-black/20 rounded-xl border border-white/5 overflow-hidden">
        <ActivityFeed events={events} />
      </div>
    </div>
  );
};

export default FleetStatus;
