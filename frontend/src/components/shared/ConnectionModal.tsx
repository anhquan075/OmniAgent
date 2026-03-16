import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon, WalletIcon, ShieldCheckIcon, ZapIcon, GlobeIcon } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export function ConnectionModal({ isOpen, onClose, title, description }: ConnectionModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* Modal Content */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-md glass-dark rounded-[32px] border border-white/10 shadow-2xl overflow-hidden p-8"
          >
            {/* Close Button */}
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 text-neutral-gray transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>

            {/* Icon Header */}
            <div className="flex justify-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-tether-teal/10 flex items-center justify-center border border-tether-teal/20 shadow-glow-sm">
                <ShieldCheckIcon className="w-8 h-8 text-tether-teal" />
              </div>
            </div>

            {/* Text Content */}
            <div className="text-center mb-10">
              <h2 className="text-2xl font-heading font-bold text-white mb-3 uppercase tracking-tight">
                {title || "Initialize Terminal"}
              </h2>
              <p className="text-sm text-neutral-gray-light leading-relaxed">
                {description || "To command the OmniWDK Strategist and access cross-chain settlement rails, a secure neural link (wallet connection) must be established."}
              </p>
            </div>

            {/* Feature Teasers */}
            <div className="space-y-4 mb-10">
              <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5">
                <div className="p-2 rounded-lg bg-cyber-cyan/10 text-cyber-cyan">
                  <ZapIcon className="w-4 h-4" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-heading font-bold text-white uppercase tracking-wider">Execute Auctions</span>
                  <span className="text-[9px] text-neutral-gray">Participate in Rebalance Rights Auctions.</span>
                </div>
              </div>
              <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5">
                <div className="p-2 rounded-lg bg-tether-teal/10 text-tether-teal">
                  <GlobeIcon className="w-4 h-4" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-heading font-bold text-white uppercase tracking-wider">Omnichain Flow</span>
                  <span className="text-[9px] text-neutral-gray">Monitor USD₮ mobility across 5+ chains.</span>
                </div>
              </div>
            </div>

            {/* Action */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-full scale-110 flex justify-center">
                <ConnectButton label="Secure Connection" />
              </div>
              <p className="text-[8px] font-mono text-neutral-gray uppercase tracking-[0.2em] animate-pulse mt-2">
                End-to-End Encrypted Link
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
