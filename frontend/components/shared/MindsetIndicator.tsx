import React from 'react';
import { motion } from 'framer-motion';
import { ActivityIcon, BrainCircuitIcon, CpuIcon, SearchIcon } from 'lucide-react';

export type AgentState = 'IDLE' | 'SCANNING' | 'THINKING' | 'EXECUTING';

interface MindsetIndicatorProps {
  state: AgentState;
}

const stateConfig = {
  IDLE: {
    icon: CpuIcon,
    label: 'IDLE',
    color: 'text-neutral-gray',
    bg: 'bg-neutral-gray/10',
    border: 'border-neutral-gray/20',
    glow: 'shadow-none',
    animate: {}
  },
  SCANNING: {
    icon: SearchIcon,
    label: 'SCANNING',
    color: 'text-cyber-cyan',
    bg: 'bg-cyber-cyan/10',
    border: 'border-cyber-cyan/20',
    glow: 'shadow-[0_0_10px_rgba(0,209,255,0.3)]',
    animate: { opacity: [0.5, 1, 0.5] }
  },
  THINKING: {
    icon: BrainCircuitIcon,
    label: 'THINKING',
    color: 'text-xaut-gold',
    bg: 'bg-xaut-gold/10',
    border: 'border-xaut-gold/20',
    glow: 'shadow-[0_0_25px_rgba(212,175,55,0.4)]',
    animate: { 
      rotate: [0, 5, -5, 0],
      scale: [1, 1.02, 1]
    }
  },
  EXECUTING: {
    icon: ActivityIcon,
    label: 'EXECUTING',
    color: 'text-tether-teal',
    bg: 'bg-tether-teal/10',
    border: 'border-tether-teal/20',
    glow: 'shadow-[0_0_15px_rgba(38,161,123,0.5)]',
    animate: { scale: [1, 1.05, 1] }
  }
};

export function MindsetIndicator({ state }: MindsetIndicatorProps) {
  const config = stateConfig[state] || stateConfig.SCANNING;
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-full border backdrop-blur-md transition-all duration-500 ${config.bg} ${config.border} ${config.glow}`}>
      <motion.div
        animate={config.animate}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className={config.color}
      >
        <Icon className="w-4 h-4" />
      </motion.div>
      
      <div className="flex flex-col">
        <span className="text-[8px] font-heading text-neutral-gray uppercase tracking-[0.2em] leading-none mb-1">Agent Mindset</span>
        <span className={`text-[10px] font-heading font-bold tracking-widest ${config.color}`}>
          {config.label}
        </span>
      </div>

      {state && state !== 'IDLE' && (
        <div className="ml-2 flex gap-1">
          <span className={`w-1 h-1 rounded-full ${config.color.replace('text-', 'bg-')} animate-pulse`} />
          <span className={`w-1 h-1 rounded-full ${config.color.replace('text-', 'bg-')} animate-pulse [animation-delay:0.2s]`} />
          <span className={`w-1 h-1 rounded-full ${config.color.replace('text-', 'bg-')} animate-pulse [animation-delay:0.4s]`} />
        </div>
      )}
    </div>
  );
}
