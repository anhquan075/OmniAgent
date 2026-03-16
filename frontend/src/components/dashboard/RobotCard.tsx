import React from 'react';
import { cn } from '../../lib/utils';
import { Truck, Sparkles, Scan, LucideIcon } from 'lucide-react';

interface RobotCardProps {
  id: string;
  type: string;
  icon: LucideIcon;
  status: 'Working' | 'Idle';
  totalEarned: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Delivery: Truck,
  Cleaning: Sparkles,
  Inspection: Scan,
};

const RobotCard: React.FC<RobotCardProps> = ({ id, type, icon: Icon, status, totalEarned }) => {
  const isWorking = status === 'Working';
  const IconComponent = ICON_MAP[type] || Truck;

  return (
    <div className="rounded-lg bg-white/5 border border-white/10 p-3 transition-all hover:border-tether-teal/30 hover:bg-white/[0.07]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-heading font-medium text-white truncate flex items-center gap-1.5">
          <IconComponent className="w-3.5 h-3.5 text-tether-teal" />
          {type}
        </span>
        <span className={cn(
          "text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border",
          isWorking
            ? "bg-neon-green/10 text-neon-green border-neon-green/30"
            : "bg-neutral-gray/10 text-neutral-gray border-neutral-gray/30"
        )}>
          {status}
        </span>
      </div>
      <div className="text-sm font-heading font-bold text-tether-teal leading-none">
        {totalEarned} <span className="text-[9px] text-neutral-gray font-normal">ETH</span>
      </div>
      <div className="mt-1.5 text-[8px] text-neutral-gray font-mono tracking-wider">
        ID: {id}
      </div>
    </div>
  );
};

export default RobotCard;
