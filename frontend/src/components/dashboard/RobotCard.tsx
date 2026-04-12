import React from 'react';
import { cn } from '../../lib/utils';
import { Truck, Sparkles, Scan, Shield, Radar, Zap, Lock, Eye, Activity, ShieldAlert, Target, LucideIcon } from 'lucide-react';
import { SpotlightCard } from '../ui/SpotlightCard';

interface RobotCardProps {
  id: string;
  type: string;
  icon: LucideIcon | string;
  status: 'Working' | 'Idle';
  totalEarned: string;
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

const RobotCard: React.FC<RobotCardProps> = ({ id, type, icon, status, totalEarned }) => {
  const isWorking = status === 'Working';
  const iconStr = typeof icon === 'string' ? icon : '';
  const IconComponent = ICON_MAP[type] || ICON_MAP[iconStr] || (typeof icon !== 'string' ? icon : Truck);

  return (
    <SpotlightCard
      spotlightColor={isWorking ? 'rgba(38, 161, 123, 0.15)' : 'rgba(255,255,255,0.05)'}
      className={cn(
        'rounded-lg border p-2.5 sm:p-3 transition-all duration-300',
        isWorking
          ? 'bg-white/5 border-tether-teal/20 hover:border-tether-teal/40'
          : 'bg-white/[0.03] border-white/8 hover:border-white/15'
      )}
    >
      {/* Top row: icon + status dot */}
      <div className="flex items-center justify-between mb-2">
        <div className="relative flex-shrink-0">
          {isWorking && (
            <span className="absolute inset-0 rounded-full border border-tether-teal/50 animate-ping" />
          )}
          <div className={cn(
            'w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center',
            isWorking ? 'bg-tether-teal/15 text-tether-teal' : 'bg-white/5 text-neutral-gray'
          )}>
            <IconComponent className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
          </div>
        </div>

        <span className={cn(
          'text-[7px] sm:text-[8px] font-heading font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border flex-shrink-0 flex items-center gap-1',
          isWorking
            ? 'bg-neon-green/10 text-neon-green border-neon-green/25'
            : 'bg-neutral-gray/10 text-neutral-gray border-neutral-gray/20'
        )}>
          <span className={cn('w-1 h-1 rounded-full flex-shrink-0', isWorking ? 'bg-neon-green animate-pulse' : 'bg-neutral-gray')} />
          {isWorking ? 'On' : 'Off'}
        </span>
      </div>

      {/* Type name */}
      <p className="text-[9px] sm:text-[10px] font-heading font-semibold text-white tracking-wider uppercase truncate mb-1">{type}</p>

      {/* Earnings */}
      <div className={cn(
        'text-xs sm:text-sm font-heading font-semibold leading-none truncate',
        isWorking ? 'text-tether-teal' : 'text-white/50'
      )}>
        {totalEarned}
        <span className="text-[8px] sm:text-[9px] font-heading text-neutral-gray font-normal tracking-wider ml-0.5">USDT</span>
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-0.5 w-full rounded-full bg-white/5 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-1000',
            isWorking ? 'bg-gradient-to-r from-tether-teal to-cyber-cyan' : 'bg-white/10'
          )}
          style={{ width: isWorking ? '100%' : '30%', animation: isWorking ? 'earnings-pulse 2s ease-in-out infinite alternate' : 'none' }}
        />
      </div>

      <div className="mt-1 text-[7px] sm:text-[8px] font-heading text-neutral-gray/40 tracking-wider truncate">
        {id}
      </div>

      <style>{`
        @keyframes earnings-pulse {
          0%   { opacity: 0.6; }
          100% { opacity: 1; }
        }
      `}</style>
    </SpotlightCard>
  );
};

export default RobotCard;
