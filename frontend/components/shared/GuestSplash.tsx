import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheckIcon, ZapIcon, GlobeIcon, BrainCircuitIcon, WalletIcon } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const FeatureItem = ({ icon: Icon, title, description, delay }: { icon: any, title: string, description: string, delay: number }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.8, delay }}
    className="flex flex-col items-center text-center p-6 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-tether-teal/30 transition-all group"
  >
    <div className="p-3 rounded-xl bg-tether-teal/10 text-tether-teal mb-4 group-hover:scale-110 transition-transform">
      <Icon className="w-6 h-6 shadow-glow-sm" />
    </div>
    <h3 className="font-heading text-xs font-bold tracking-widest text-white mb-2 uppercase">{title}</h3>
    <p className="text-[10px] text-neutral-gray-light leading-relaxed max-w-[200px]">{description}</p>
  </motion.div>
);

export function GuestSplash() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-space-black">
        <div className="absolute top-[-10%] left-[-5%] w-[60%] h-[60%] bg-tether-teal/10 rounded-full blur-[120px] animate-float"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[60%] h-[60%] bg-cyber-blue/10 rounded-full blur-[120px] animate-float" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Glass Panel */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-5xl glass-dark rounded-[40px] border-white/10 shadow-2xl p-8 md:p-16 flex flex-col items-center overflow-hidden"
      >
        {/* Subtle Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>

        {/* Branding */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center mb-12"
        >
          <div className="w-20 h-20 rounded-2xl bg-space-black flex items-center justify-center shadow-glow-lg border border-tether-teal/20 mb-6 overflow-hidden">
            <img src="/imgs/logo.png" alt="OmniWDK" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-4xl md:text-6xl font-heading font-black tracking-tighter text-center mb-4">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-tether-teal to-cyber-cyan">OMNIWDK</span>
          </h1>
          <p className="text-sm md:text-base font-heading font-bold tracking-[0.3em] text-neutral-gray uppercase text-center">
            Autonomous Financial Operating System
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-16">
          <FeatureItem 
            icon={ShieldCheckIcon}
            title="ZK-Risk Scoring"
            description="Institutional-grade risk assessment using zero-knowledge proofs for trustless security."
            delay={0.2}
          />
          <FeatureItem 
            icon={ZapIcon}
            title="Rebalance Rights"
            description="Decentralized execution auctions ensuring optimal capital efficiency and yield capture."
            delay={0.4}
          />
          <FeatureItem 
            icon={GlobeIcon}
            title="Omnichain Yield"
            description="Unified liquidity management across multiple settlement rails powered by Tether WDK."
            delay={0.6}
          />
        </div>

        {/* Action Section */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="h-px w-24 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
          <div className="scale-125 hover:scale-150 transition-transform duration-500">
            <ConnectButton label="Initialize Terminal" />
          </div>
          <p className="text-[10px] font-mono text-neutral-gray uppercase tracking-widest animate-pulse">
            Secure Neural Link Required for Command
          </p>
        </motion.div>

        {/* Decorative Elements */}
        <div className="absolute bottom-[-50px] left-1/2 -translate-x-1/2 w-full h-32 bg-tether-teal/20 blur-[100px] rounded-full pointer-events-none"></div>
      </motion.div>
    </div>
  );
}
