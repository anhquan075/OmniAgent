import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon } from 'lucide-react';
import WDKVaultV2Client from '../WDKVaultV2Client';

interface DashboardOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DashboardOverlay: React.FC<DashboardOverlayProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, backdropFilter: 'blur(0px)' }}
          animate={{ opacity: 1, scale: 1, backdropFilter: 'blur(16px)' }}
          exit={{ opacity: 0, scale: 0.95, backdropFilter: 'blur(0px)' }}
          transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
          className="fixed inset-0 z-[100] flex flex-col bg-space-black/80 p-6 md:p-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-8 px-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gold-gradient flex items-center justify-center shadow-glow-md font-heading">
                <span className="text-space-black font-bold text-xl tracking-tighter">D</span>
              </div>
              <div className="flex flex-col">
                <h2 className="text-xl font-heading font-bold tracking-tight bg-clip-text text-transparent bg-gold-gradient uppercase">Deep-Dive Analytics</h2>
                <span className="text-[10px] font-heading tracking-widest text-neutral-gray-light uppercase">Full Protocol Observability</span>
              </div>
            </div>
            
            <button 
              onClick={onClose}
              className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all duration-300 border border-white/10 group"
            >
              <XIcon className="w-6 h-6 group-hover:rotate-90 transition-transform duration-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 glass-dark rounded-[2.5rem] border border-white/10 overflow-hidden relative shadow-2xl">

            <div className="h-full w-full overflow-y-auto custom-scrollbar p-8">
              <WDKVaultV2Client />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
