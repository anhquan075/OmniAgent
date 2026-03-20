import React from 'react';
import { cn } from '../../lib/utils';
import { Truck, Sparkles, Scan, Shield, Radar, Zap, Lock, Eye, Activity, ShieldAlert, Target, LucideIcon } from 'lucide-react';

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
    <div className="rounded-lg bg-white/5 border border-white/10 p-3 transition-all hover:border-tether-teal/30 hover:bg-white/[0.07]">
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <span className="text-[10px] font-heading font-medium text-white truncate flex items-center gap-1.5 flex-1 min-w-0">
          <IconComponent className="w-3.5 h-3.5 text-tether-teal flex-shrink-0" />
          <span className="truncate">{type}</span>
        </span>
        <span className={cn(
          "text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border flex-shrink-0",
          isWorking
            ? "bg-neon-green/10 text-neon-green border-neon-green/30"
            : "bg-neutral-gray/10 text-neutral-gray border-neutral-gray/30"
        )}>
          {status}
        </span>
      </div>
      <div className="text-sm font-heading font-bold text-tether-teal leading-none">
        {totalEarned} <span className="text-[9px] text-neutral-gray font-normal">USDT</span>
      </div>
      <div className="mt-1.5 text-[8px] text-neutral-gray font-mono tracking-wider">
        ID: {id}
      </div>
    </div>
  );
};

export default RobotCard;
