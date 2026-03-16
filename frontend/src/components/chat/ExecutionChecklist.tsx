import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2Icon, CircleIcon, Loader2Icon, AlertCircleIcon, ExternalLinkIcon } from 'lucide-react';
import { BLOCK_EXPLORERS } from '@/lib/networkConfig';

export type StepStatus = 'waiting' | 'active' | 'success' | 'error';

export interface ExecutionStep {
  id: string;
  label: string;
  status: StepStatus;
  subtext?: string;
  txHash?: string;
}

interface ExecutionChecklistProps {
  title: string;
  steps: ExecutionStep[];
}

const Step: React.FC<{ step: ExecutionStep; isLast: boolean }> = ({ step, isLast }) => {
  const isActive = step.status === 'active';
  const isSuccess = step.status === 'success';
  const isError = step.status === 'error';

  return (
    <div className="flex gap-4 relative">
      {!isLast && (
        <div className="absolute left-[9px] top-6 bottom-0 w-px bg-white/10" />
      )}
      
      <div className="relative z-10 mt-1">
        {isActive ? (
          <div className="relative flex items-center justify-center">
            <Loader2Icon className="w-5 h-5 text-tether-teal animate-spin" />
            <motion.div 
              initial={{ scale: 0.8, opacity: 0.5 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute inset-0 rounded-full bg-tether-teal/30"
            />
          </div>
        ) : isSuccess ? (
          <CheckCircle2Icon className="w-5 h-5 text-neon-green" />
        ) : isError ? (
          <AlertCircleIcon className="w-5 h-5 text-red-500" />
        ) : (
          <CircleIcon className="w-5 h-5 text-neutral-gray opacity-40" />
        )}
      </div>

      <div className="flex-1 pb-6">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] font-heading font-bold tracking-tight ${
            isActive ? 'text-white' : isSuccess ? 'text-neutral-gray-light' : 'text-neutral-gray opacity-60'
          }`}>
            {step.label}
          </span>
           {step.txHash && (
             <a 
               href={`${BLOCK_EXPLORERS.WDK}/tx/${step.txHash}`}
               target="_blank"
               rel="noopener noreferrer"
               className="p-1 rounded hover:bg-white/5 text-tether-teal/60 hover:text-tether-teal transition-all"
             >
               <ExternalLinkIcon className="w-3 h-3" />
             </a>
           )}
        </div>
        {step.subtext && (
          <p className="text-[10px] text-neutral-gray mt-0.5 leading-tight">{step.subtext}</p>
        )}
      </div>
    </div>
  );
};

export const ExecutionChecklist: React.FC<ExecutionChecklistProps> = ({ title, steps }) => {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full rounded-2xl bg-black/40 border border-white/10 p-5 shadow-inner"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-tether-teal shadow-glow-sm" />
          <h4 className="text-[10px] font-heading font-bold text-white uppercase tracking-[0.2em]">{title}</h4>
        </div>
        <div className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[8px] font-mono text-neutral-gray">
          {steps.filter(s => s.status === 'success').length}/{steps.length} COMPLETE
        </div>
      </div>

      <div className="flex flex-col">
        <AnimatePresence mode="popLayout">
          {steps.map((step, idx) => (
            <motion.div
              key={step.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Step step={step} isLast={idx === steps.length - 1} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
