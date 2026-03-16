import React from 'react';
import { motion } from 'framer-motion';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ShieldCheck, Zap, Globe, Cpu } from 'lucide-react';

export function GuestSplash() {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-space-black/80 backdrop-blur-md"
    >
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center">
        
        <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-6">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-tether-teal/10 border border-tether-teal/20 text-tether-teal text-xs font-heading tracking-widest uppercase mb-4">
              <span className="w-2 h-2 rounded-full bg-tether-teal animate-pulse"></span>
              WDK Intelligence Active
            </div>
            <h1 className="text-4xl md:text-6xl font-heading font-bold leading-tight">
              <span className="bg-clip-text text-transparent bg-[linear-gradient(135deg,#26A17B,#00D1FF)]">
                Autonomous
              </span>
              <br />
              <span className="text-white">Yield Strategy</span>
            </h1>
            <p className="mt-4 text-neutral-gray-light text-lg max-w-md">
              Deploy AI-managed capital across Tether's WDK settlement rails. 
              Optimize USD₮ and XAU₮ yield with institutional-grade security.
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col gap-4 w-full md:w-auto"
          >
            <div className="p-1 rounded-xl bg-gradient-to-r from-tether-teal to-cyber-cyan shadow-glow-md">
              <div className="bg-space-black rounded-[10px] p-1">
                <ConnectButton.Custom>
                  {({ openConnectModal, mounted }) => (
                    <button
                      onClick={openConnectModal}
                      disabled={!mounted}
                      className="w-full px-8 py-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-white font-heading font-bold uppercase tracking-widest flex items-center justify-center gap-3"
                    >
                      <Zap className="w-4 h-4 text-tether-teal" />
                      Initialize WDK Agent
                    </button>
                  )}
                </ConnectButton.Custom>
              </div>
            </div>
            <p className="text-xs text-neutral-gray text-center">
              Powered by Tether WDK • Multi-Chain Settlement
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="relative hidden md:block"
        >
          <div className="absolute inset-0 bg-tether-teal/20 blur-[100px] rounded-full"></div>
          <div className="relative glass-dark p-8 rounded-3xl border border-white/10 shadow-2xl">
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: ShieldCheck, title: "Self-Custodial", desc: "Your keys, your assets" },
                { icon: Cpu, title: "AI-Managed", desc: "Autonomous optimization" },
                { icon: Globe, title: "Multi-Chain", desc: "Cross-chain liquidity" },
                { icon: Zap, title: "Instant", desc: "Real-time settlement" }
              ].map((item, i) => (
                <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-3">
                  <div className="w-10 h-10 rounded-lg bg-tether-teal/10 flex items-center justify-center text-tether-teal">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-sm">{item.title}</h3>
                    <p className="text-neutral-gray text-xs">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}
