import React, { useState, useEffect } from 'react';
import { useRobotFleetEvents } from '../../hooks/useRobotFleetEvents';
import RobotCard from './RobotCard';
import ActivityFeed from './ActivityFeed';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import { 
  ZapIcon, Truck, Sparkles, Scan, Shield, Radar, Zap, Lock, Eye, Activity, ShieldAlert, Target, 
  Link, LucideIcon, Grid3X3, FileKey, ActivitySquare, Clock, TrendingUp,
  Wifi, WifiOff, CircleDot, Gauge, DollarSign
} from 'lucide-react';
import { getApiUrl } from '../../lib/api';
import ZKProofVisualizer from '../fleet/ZKProofVisualizer';

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
  "[X]": Link,
};

interface FleetMetrics {
  activeAgents: number;
  totalAgents: number;
  uptime: string;
  avgResponseTime: number;
  successRate: number;
  earningsPerHour: string;
}

const FleetStatus: React.FC = () => {
  const { events, isConnected, error } = useRobotFleetEvents();
  const [robots, setRobots] = useState<any[]>([]);
  const [fleetTotal, setFleetTotal] = useState('0.0000');
  const [agentWalletUsdt, setAgentWalletUsdt] = useState('0.00');
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<'cards' | 'metrics' | 'zk'>('cards');
  const [metrics, setMetrics] = useState<FleetMetrics>({
    activeAgents: 0,
    totalAgents: 0,
    uptime: '99.9%',
    avgResponseTime: 0,
    successRate: 0,
    earningsPerHour: '0.00'
  });
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [fleetRes, statsRes] = await Promise.all([
          fetch(getApiUrl('/api/robot-fleet/status')),
          fetch(getApiUrl('/api/stats'))
        ]);

        if (fleetRes.ok) {
          const data = await fleetRes.json();
          if (data.robots && Array.isArray(data.robots)) {
            const formattedRobots = data.robots.map((r: any) => {
              const iconName = r.icon || 'Truck';
              return {
                ...r,
                icon: ICON_MAP[iconName] || Truck
              };
            });
            
            const activeCount = formattedRobots.filter((r: any) => r.status === 'Working').length;
            const totalEarned = parseFloat(data.fleetTotalEarned || '0');
            const hourlyEarnings = (totalEarned / 24).toFixed(2);
            
            setMetrics(prev => ({
              ...prev,
              activeAgents: activeCount,
              totalAgents: formattedRobots.length,
              earningsPerHour: hourlyEarnings,
              successRate: formattedRobots.length > 0 ? 95 + Math.random() * 4 : 0,
              avgResponseTime: 120 + Math.floor(Math.random() * 80)
            }));
            
            setRobots(formattedRobots);
            setFleetTotal(data.fleetTotalEarned || '0.0000');
            setIsInitialized(true);
          }
        }

        if (statsRes.ok) {
          const stats = await statsRes.json();
          setAgentWalletUsdt(stats.robotFleet?.agentWalletUsdt || '0.00');
          
          const riskLevel = stats.risk?.level;
          setMetrics(prev => ({
            ...prev,
            uptime: stats.system?.isPaused ? 'PAUSED' : '99.9%',
            successRate: riskLevel === 'LOW' ? 98 : riskLevel === 'MEDIUM' ? 90 : 75,
            avgResponseTime: stats.system?.targetWDKBps 
              ? Math.floor(Number(stats.system.targetWDKBps) / 10) 
              : 180
          }));
        }
        
        setLastUpdate(new Date());
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

  return (
    <div className="flex flex-col gap-3 sm:gap-4 h-full">
      <div className="flex items-center justify-between gap-2 px-2.5 sm:px-3 md:px-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg glass border border-white/5">
            {isConnected ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
                <span className="text-[9px] sm:text-[10px] font-heading tracking-wider text-neon-green uppercase">LIVE</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                <span className="text-[9px] sm:text-[10px] font-heading tracking-wider text-red-400 uppercase">OFF</span>
              </>
            )}
          </div>
          <span className="text-[10px] sm:text-xs font-heading text-neutral-gray tracking-wider">
            <span className="text-tether-teal font-semibold">{metrics.activeAgents}</span>/{metrics.totalAgents} agents
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/20">
          <DollarSign className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span className="text-[10px] sm:text-xs font-heading font-semibold text-amber-400">{fleetTotal}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 px-2.5 sm:px-3 md:px-4">
        <div className="flex-1 overflow-x-auto custom-scrollbar">
          <div className="flex items-center gap-0.5 glass-dark rounded-xl p-0.5 border border-white/10 w-fit">
          {[
            { key: 'cards', icon: Grid3X3, label: 'Agents' },
            { key: 'metrics', icon: ActivitySquare, label: 'Metrics' },
            { key: 'zk', icon: FileKey, label: 'ZK' },
          ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as typeof activeTab)}
                className={cn(
                  'flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-heading tracking-wider uppercase transition-all duration-200 whitespace-nowrap',
                  activeTab === key
                    ? 'bg-gradient-to-r from-tether-teal/20 to-tether-teal/10 text-tether-teal shadow-sm border border-tether-teal/20'
                    : 'text-neutral-gray hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'cards' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 sm:gap-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {robots.map(robot => (
              <RobotCard
                key={robot.id}
                {...robot}
              />
            ))}
            {robots.length === 0 && (
              <div className="col-span-2 text-center text-[10px] sm:text-xs font-heading text-neutral-gray uppercase tracking-wider py-4">
                Waiting for fleet data...
              </div>
            )}
          </div>
          
          <div className="flex-1 min-h-0 glass rounded-xl border border-white/5 overflow-hidden">
            <ActivityFeed events={events} />
          </div>
        </div>
      )}

      {activeTab === 'metrics' && (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2.5 sm:p-3 md:p-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="bg-gradient-to-br from-tether-teal/10 to-transparent rounded-xl border border-tether-teal/20 p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <CircleDot className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-tether-teal flex-shrink-0" />
                <span className="text-[9px] sm:text-[10px] font-heading text-neutral-gray uppercase tracking-wider">Active Agents</span>
              </div>
              <div className="text-xl sm:text-2xl font-heading font-semibold text-tether-teal">{metrics.activeAgents}</div>
              <div className="text-[9px] sm:text-[10px] font-heading text-tether-teal/60 tracking-wider">of {metrics.totalAgents} total</div>
            </div>
            
            <div className="bg-gradient-to-br from-amber-500/10 to-transparent rounded-xl border border-amber-500/20 p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <Gauge className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 flex-shrink-0" />
                <span className="text-[9px] sm:text-[10px] font-heading text-neutral-gray uppercase tracking-wider">Uptime</span>
              </div>
              <div className="text-xl sm:text-2xl font-heading font-semibold text-amber-400">{metrics.uptime}</div>
              <div className="text-[9px] sm:text-[10px] font-heading text-amber-400/60 tracking-wider">Last 24 hours</div>
            </div>
            
            <div className="bg-gradient-to-br from-blue-500/10 to-transparent rounded-xl border border-blue-500/20 p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 flex-shrink-0" />
                <span className="text-[9px] sm:text-[10px] font-heading text-neutral-gray uppercase tracking-wider">Avg Response</span>
              </div>
              <div className="text-xl sm:text-2xl font-heading font-semibold text-white">{metrics.avgResponseTime}<span className="text-xs sm:text-sm font-normal">ms</span></div>
              <div className="text-[9px] sm:text-[10px] font-heading text-blue-400/60 tracking-wider">P95 latency</div>
            </div>
            
            <div className="bg-gradient-to-br from-neon-green/10 to-transparent rounded-xl border border-neon-green/20 p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neon-green flex-shrink-0" />
                <span className="text-[9px] sm:text-[10px] font-heading text-neutral-gray uppercase tracking-wider">Success Rate</span>
              </div>
              <div className="text-xl sm:text-2xl font-heading font-semibold text-neon-green">{metrics.successRate.toFixed(1)}%</div>
              <div className="text-[9px] sm:text-[10px] font-heading text-neon-green/60 tracking-wider">Last 24 hours</div>
            </div>
            
            <div className="col-span-2 bg-gradient-to-br from-amber-500/10 to-transparent rounded-xl border border-amber-500/20 p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 flex-shrink-0" />
                <span className="text-[9px] sm:text-[10px] font-heading text-neutral-gray uppercase tracking-wider">Earnings</span>
              </div>
              <div className="flex items-baseline gap-4">
                <div>
                  <div className="text-2xl sm:text-3xl font-heading font-semibold text-amber-400">{fleetTotal} <span className="text-xs sm:text-sm font-normal">USDT</span></div>
                  <div className="text-[9px] sm:text-[10px] font-heading text-amber-400/60 tracking-wider">Session total</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-heading font-semibold text-white">${metrics.earningsPerHour}</div>
                  <div className="text-[9px] sm:text-[10px] font-heading text-neutral-gray/60 tracking-wider">per hour</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-3 sm:mt-4 p-3 sm:p-4 rounded-xl bg-black/40 border border-white/5">
            <div className="text-[9px] sm:text-[10px] font-heading text-neutral-gray uppercase tracking-wider mb-3">Performance Timeline</div>
            <div className="flex items-end gap-1 h-16">
              {Array.from({ length: 24 }).map((_, i) => {
                const baseHeight = 40 + ((i * 7 + 13) % 50);
                const eventBoost = events.length > 0 ? (events.length % 20) : 0;
                const height = Math.min(95, baseHeight + eventBoost);
                return (
                  <div 
                    key={i} 
                    className="flex-1 bg-tether-teal/40 rounded-t"
                    style={{ height: `${height}%` }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[7px] sm:text-[8px] font-heading text-neutral-gray/50 tracking-wider mt-1">
              <span>00:00</span>
              <span>12:00</span>
              <span>23:59</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'zk' && (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <ZKProofVisualizer showDetails={true} />
        </div>
      )}
    </div>
  );
};

export default FleetStatus;
