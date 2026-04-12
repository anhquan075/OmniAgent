import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { 
  Shield, TrendingUp, Lock, Unlock, Crown, 
  Star, Activity, Zap, ChevronUp, ChevronDown
} from 'lucide-react';

interface KYCLevelBadgeProps {
  level: number; // 0, 1, 2, 3
  showDetails?: boolean;
  className?: string;
  onLevelChange?: (level: number) => void;
}

interface LevelConfig {
  level: number;
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  maxDeposit: string;
  maxExposure: string;
  yieldMultiplier: number;
  features: string[];
}

const LEVEL_CONFIGS: LevelConfig[] = [
  {
    level: 0,
    name: 'Unverified',
    color: 'rgb(107, 114, 128)',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    borderColor: 'rgba(107, 114, 128, 0.3)',
    maxDeposit: '$0',
    maxExposure: '0%',
    yieldMultiplier: 0,
    features: ['KYC required for deposit', 'View-only access'],
  },
  {
    level: 1,
    name: 'Basic',
    color: 'var(--color-cyber-blue)',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    maxDeposit: '$1,000',
    maxExposure: '5%',
    yieldMultiplier: 1.0,
    features: ['Vault deposits', 'Basic yield strategies', 'Single-chain operations'],
  },
  {
    level: 2,
    name: 'Intermediate',
    color: 'var(--color-neon-green)',
    bgColor: 'rgba(74, 222, 128, 0.1)',
    borderColor: 'rgba(74, 222, 128, 0.3)',
    maxDeposit: '$10,000',
    maxExposure: '15%',
    yieldMultiplier: 1.25,
    features: ['Multi-chain operations', 'Advanced yield', 'X402 payments'],
  },
  {
    level: 3,
    name: 'Advanced',
    color: 'var(--color-xaut-gold)',
    bgColor: 'rgba(212, 175, 55, 0.1)',
    borderColor: 'rgba(212, 175, 55, 0.3)',
    maxDeposit: '$100,000+',
    maxExposure: '20%',
    yieldMultiplier: 1.5,
    features: ['Full vault access', 'Yield farming', 'Agent fleet control', 'Recurring payments'],
  },
];

const KYCLevelBadge: React.FC<KYCLevelBadgeProps> = ({ 
  level,
  showDetails = true,
  className,
  onLevelChange
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const config = LEVEL_CONFIGS.find(c => c.level === level) || LEVEL_CONFIGS[0];
  
  // Simulate level changes for demo
  useEffect(() => {
    setIsAnimating(true);
    const timer = setTimeout(() => setIsAnimating(false), 500);
    return () => clearTimeout(timer);
  }, [level]);

  const getLevelIcon = (lvl: number) => {
    if (lvl === 0) return <Lock className="w-4 h-4" />;
    if (lvl === 1) return <Shield className="w-4 h-4" />;
    if (lvl === 2) return <Star className="w-4 h-4" />;
    return <Crown className="w-4 h-4" />;
  };

  const getLevelBadge = (lvl: number) => {
    if (lvl === 0) return 'KYC';
    if (lvl === 1) return 'L1';
    if (lvl === 2) return 'L2';
    return 'L3';
  };

  return (
    <div className={cn('relative', className)}>
      {/* Main badge */}
      <button
        onClick={() => showDetails && setIsExpanded(!isExpanded)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-300 cursor-pointer',
          isAnimating && 'scale-105'
        )}
        style={{
          backgroundColor: config.bgColor,
          borderColor: config.borderColor,
        }}
      >
        {/* Level icon */}
        <div 
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${config.color}20`, color: config.color }}
        >
          {getLevelIcon(level)}
        </div>
        
        {/* Level info */}
        <div className="text-left">
          <div className="flex items-center gap-1.5">
            <span 
              className="text-sm font-bold"
              style={{ color: config.color }}
            >
              {getLevelBadge(level)}
            </span>
            <span className="text-[10px] font-medium text-neutral-gray uppercase">
              {config.name}
            </span>
          </div>
          
          {/* Yield multiplier */}
          {config.yieldMultiplier > 0 && (
            <div className="flex items-center gap-1 text-[9px]">
              <TrendingUp className="w-2.5 h-2.5 text-neon-green" />
              <span className="text-neon-green font-medium">
                {config.yieldMultiplier}x Yield
              </span>
            </div>
          )}
        </div>
        
        {/* Expand indicator */}
        {showDetails && (
          <div className={cn(
            'ml-1 transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}>
            <ChevronDown className="w-4 h-4 text-neutral-gray" />
          </div>
        )}
      </button>

      {/* Expanded details */}
      {showDetails && isExpanded && (
        <div 
          className="absolute top-full mt-2 left-0 right-0 p-4 rounded-xl border z-20 animate-in fade-in slide-in-from-top-2"
          style={{
            backgroundColor: 'rgba(0,0,0,0.9)',
            borderColor: config.borderColor,
          }}
        >
          {/* Limits */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="glass p-3 rounded-lg">
              <div className="text-[9px] text-neutral-gray uppercase tracking-wide">Max Deposit</div>
              <div className="text-base font-bold text-white mt-1">{config.maxDeposit}</div>
            </div>
            <div className="glass p-3 rounded-lg">
              <div className="text-[9px] text-neutral-gray uppercase tracking-wide">Max Exposure</div>
              <div className="text-base font-bold text-white mt-1">{config.maxExposure}</div>
            </div>
          </div>

          {/* Yield multiplier highlight */}
          <div className="p-3 rounded-lg mb-4" style={{ backgroundColor: config.bgColor }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" style={{ color: config.color }} />
                <span className="text-xs font-medium" style={{ color: config.color }}>
                  Yield Boost
                </span>
              </div>
              <span className="text-xl font-bold" style={{ color: config.color }}>
                +{(config.yieldMultiplier - 1) * 100}%
              </span>
            </div>
          </div>

          {/* Features */}
          <div className="space-y-2">
            <div className="text-[9px] text-neutral-gray uppercase mb-2 tracking-wide">Enabled Features</div>
            {config.features.map((feature, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-2 text-[10px] text-white/90"
              >
                <Activity className="w-3.5 h-3.5 text-neon-green flex-shrink-0" />
                {feature}
              </div>
            ))}
          </div>

          {/* Level selector (for demo) */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="text-[9px] text-neutral-gray uppercase mb-2 tracking-wide">Demo: Switch Level</div>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => onLevelChange?.(lvl)}
                  className={cn(
                    'flex-1 py-1.5 rounded text-xs font-bold transition-all',
                    level === lvl 
                      ? 'text-black' 
                      : 'bg-white/10 text-neutral-gray hover:bg-white/20'
                  )}
                  style={{
                    backgroundColor: level === lvl ? LEVEL_CONFIGS[lvl].color : undefined,
                  }}
                >
                  L{lvl}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KYCLevelBadge;