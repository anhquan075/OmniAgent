import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheckIcon, ZapIcon, GlobeIcon, BrainCircuitIcon, WalletIcon, LockIcon } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const FeatureItem = ({ icon: Icon, title, description, delay }: { icon: any, title: string, description: string, delay: number }) => (
  <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-tether-teal/30 group transition-all">
    <div className="p-3 rounded-xl bg-tether-teal/10 text-tether-teal mb-4 group-hover:scale-110 transition-transform">
      <Icon className="w-6 h-6 shadow-glow-sm" />
    </div>
    <h3 className="font-heading text-xs font-bold tracking-widest text-white mb-2 uppercase">{title}</h3>
    <p className="text-[10px] text-neutral-gray-light leading-relaxed max-w-[200px]">{description}</p>
  </div>
);

export function GuestSplash() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-space-black">
        <div className="absolute top-[-10%] left-[-5%] w-[60%] h-[60%] bg-tether-teal/5 rounded-full blur-[80px] opacity-50"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[60%] h-[60%] bg-cyber-blue/5 rounded-full blur-[80px] opacity-50"></div>
      </div>

      {/* Glass Panel */}
      <div className="relative w-full max-w-5xl glass-dark rounded-[40px] border-white/10 shadow-2xl p-8 md:p-12 flex flex-col items-center overflow-hidden">
        {/* Dominance Callout */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
           <div className="px-4 py-1.5 rounded-full bg-tether-teal/10 border border-tether-teal/20 flex items-center gap-2">
              <LockIcon size={10} className="text-tether-teal animate-pulse" />
              <span className="text-[9px] font-heading font-bold text-tether-teal uppercase tracking-[0.2em]">The Secure AI Agent — ZK-Proven Intelligence</span>
           </div>
        </div>

        {/* Subtle Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>

        {/* Branding */}
        <div className="flex flex-col items-center mb-8 md:mb-12 mt-4">
          <div className="w-40 h-40 md:w-52 md:h-52 flex items-center justify-center mb-6 relative">
            <div className="absolute inset-4 bg-tether-teal/15 blur-[40px] rounded-full animate-pulse"></div>
            <div className="w-full h-full rounded-[2rem] overflow-hidden relative z-10">
              <img 
                src="/imgs/mascot-owl-no-bg.png" 
                alt="OmniWDK Mascot" 
                className="w-full h-full object-contain" 
              />
            </div>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-heading font-black tracking-tighter text-center mb-4">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-tether-teal to-cyber-cyan">OMNIWDK</span>
          </h1>
          <p className="text-xs md:text-sm font-heading font-bold tracking-[0.2em] text-neutral-gray uppercase text-center opacity-80 max-w-lg leading-relaxed">
            Eliminating "Black Box" AI Risk with <span className="text-tether-teal">Verifiable On-Chain Reasoning</span>
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 w-full mb-10 md:mb-16">
          <FeatureItem 
            icon={ShieldCheckIcon}
            title="ZK-Risk Integrity"
            description="Unlike standard agents, our risk parameters are cryptographically binding and verifiable on-chain."
            delay={0.1}
          />
          <FeatureItem 
            icon={ZapIcon}
            title="Dutch Auctions"
            description="Optimal price discovery for rebalances via searcher competition. Minimizing slippage & MEV."
            delay={0.2}
          />
          <FeatureItem 
            icon={GlobeIcon}
            title="WDK Native"
            description="Unified, non-custodial capital routing across EVM, Solana & TON using Tether WDK."
            delay={0.3}
          />
        </div>

        {/* Action Section */}
        <div className="flex flex-col items-center gap-6">
          <div className="h-px w-20 bg-white/10"></div>
          <div>
            <ConnectButton label="Enter Secure Terminal" />
          </div>
          <p className="text-[9px] font-mono text-neutral-gray uppercase tracking-widest opacity-60">
            Institutional-Grade Neural Link
          </p>
        </div>

        <div className="absolute bottom-[-40px] left-1/2 -translate-x-1/2 w-full h-24 bg-tether-teal/10 blur-[60px] rounded-full pointer-events-none"></div>
      </div>
    </div>
  );
}
