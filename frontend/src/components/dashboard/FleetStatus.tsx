import React, { useState, useEffect } from 'react';
import { useRobotFleetEvents } from '../../hooks/useRobotFleetEvents';
import RobotCard from './RobotCard';
import ActivityFeed from './ActivityFeed';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import { ZapIcon, Truck, Sparkles, Scan, LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Delivery: Truck,
  Cleaning: Sparkles,
  Inspection: Scan,
};

const FleetStatus: React.FC = () => {
  const { events, isConnected, error } = useRobotFleetEvents();
  const [robots, setRobots] = useState<any[]>([]);
  const [fleetTotal, setFleetTotal] = useState('0.0000');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/robot-fleet/status');
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
      
      setRobots(prevRobots => {
        const exists = prevRobots.some(r => r.id === latestEvent.robotId);
        
        if (!exists) {
          const iconName = (latestEvent as any).iconName || 'Truck';
          return [...prevRobots, {
            id: latestEvent.robotId,
            type: latestEvent.type,
            icon: latestEvent.icon,
            status: 'Working',
            totalEarned: latestEvent.earnings
          }];
        }
        
        return prevRobots.map(robot => {
          if (robot.id === latestEvent.robotId) {
            const newTotal = (parseFloat(robot.totalEarned || '0') + parseFloat(latestEvent.earnings)).toFixed(4);
            return {
              ...robot,
              status: 'Working',
              totalEarned: newTotal
            };
          }
          return robot;
        });
      });

      setFleetTotal(prevTotal => (parseFloat(prevTotal || '0') + parseFloat(latestEvent.earnings)).toFixed(4));
    }
  }, [events, isInitialized]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRobots(prevRobots => prevRobots.map(robot => ({
        ...robot,
        status: Math.random() > 0.3 ? 'Working' : 'Idle'
      })));
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn(
            "transition-colors border h-6 px-2 text-[10px] font-medium uppercase tracking-wider",
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
          <span className="text-[9px] text-neutral-gray uppercase tracking-wider">Session Earnings</span>
          <div className="flex items-center gap-1.5 text-tether-teal font-heading font-bold text-lg leading-none">
            <ZapIcon className="w-3 h-3 fill-current" />
            <span className="animate-in fade-in slide-in-from-top-1 duration-500 key-[fleetTotal]">{fleetTotal} ETH</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
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
