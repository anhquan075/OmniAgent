import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ShieldCheck, Zap, Globe, Cpu, TrendingUp, Lock, Zap as ZapIcon } from 'lucide-react';

export function GuestSplash() {
  // Detect user's motion preference (WCAG accessibility requirement)
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: prefersReducedMotion ? 0 : 0.1,
        delayChildren: prefersReducedMotion ? 0 : 0.6,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 20 },
    visible: { 
      opacity: 1, 
      y: 0, 
      transition: { duration: prefersReducedMotion ? 0 : 0.5 } 
    },
  };

  const features = [
    { 
      icon: ShieldCheck, 
      title: "Self-Custodial", 
      desc: "Your keys, your assets",
      accent: "from-tether-teal to-cyan-400"
    },
    { 
      icon: Cpu, 
      title: "AI-Managed", 
      desc: "Autonomous optimization",
      accent: "from-cyan-400 to-blue-400"
    },
    { 
      icon: Globe, 
      title: "Multi-Chain", 
      desc: "Cross-chain liquidity",
      accent: "from-blue-400 to-purple-400"
    },
    { 
      icon: Zap, 
      title: "Instant", 
      desc: "Real-time settlement",
      accent: "from-purple-400 to-pink-400"
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 sm:p-6 bg-space-black/80 backdrop-blur-md overflow-y-auto"
    >
      <div className="max-w-6xl w-full py-6 sm:py-8 sm:py-12 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 sm:gap-8 md:gap-12 lg:gap-16 items-center mb-8 sm:mb-12 md:mb-16">
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left space-y-6 sm:space-y-7 sm:space-y-8">
            <motion.div
              initial={{ y: prefersReducedMotion ? 0 : 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.1 }}
            >
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gradient-to-r from-tether-teal/10 to-cyan-400/10 border border-tether-teal/30 text-tether-teal text-xs font-heading tracking-widest uppercase">
                <span className="w-2 h-2 rounded-full bg-tether-teal animate-pulse"></span>
                <span className="hidden sm:inline">WDK Intelligence Active</span>
                <span className="sm:hidden">WDK Active</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ y: prefersReducedMotion ? 0 : 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.15 }}
              className="space-y-3 sm:space-y-4"
            >
              <h1 className="text-2xl sm:text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-heading font-bold leading-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-tether-teal via-cyan-400 to-blue-400">
                  Autonomous
                </span>
                <br />
                <span className="text-white">Yield Engine</span>
              </h1>
              <p className="text-xs sm:text-sm sm:text-base md:text-lg text-neutral-gray-light leading-relaxed max-w-2xl">
                AI-powered capital allocation across Tether's multi-chain settlement rails. 
                Let robots manage your {' '}
                <span className="text-tether-teal font-semibold">USD₮</span>
                {' '} and{' '}
                <span className="text-tether-teal font-semibold">XAU₮</span>
                {' '}with institutional-grade security.
              </p>
            </motion.div>

            <motion.div
              initial={{ y: prefersReducedMotion ? 0 : 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.2 }}
              className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:gap-5 w-full text-xs sm:text-sm"
            >
              <div className="flex items-start gap-2 sm:gap-3">
                <TrendingUp className="w-4 sm:w-5 h-4 sm:h-5 text-tether-teal flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">Higher Yields</div>
                  <div className="text-neutral-gray text-xs">Optimized rebalancing</div>
                </div>
              </div>
              <div className="flex items-start gap-2 sm:gap-3">
                <Lock className="w-4 sm:w-5 h-4 sm:h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-white">100% Secure</div>
                  <div className="text-neutral-gray text-xs">Non-custodial design</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ y: prefersReducedMotion ? 0 : 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.25 }}
              className="flex flex-col gap-3 sm:gap-4 w-full pt-2 sm:pt-4"
            >
              <div className="p-0.5 sm:p-1 rounded-lg sm:rounded-xl bg-gradient-to-r from-tether-teal to-cyan-400 shadow-lg shadow-tether-teal/30 hover:shadow-tether-teal/50 transition-shadow duration-300">
                <div className="bg-space-black rounded-[6px] sm:rounded-[10px] p-0.5 sm:p-1">
                  <ConnectButton.Custom>
                    {({ openConnectModal, mounted }) => (
                        <motion.button
                          onClick={openConnectModal}
                          disabled={!mounted}
                          whileHover={prefersReducedMotion ? {} : { scale: 1.02 }}
                          whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
                          className="w-full px-4 sm:px-6 sm:px-8 py-3 sm:py-4 rounded-md sm:rounded-lg bg-gradient-to-r from-white/10 to-white/5 hover:from-white/15 hover:to-white/10 transition-all text-xs sm:text-sm sm:text-base text-white font-heading font-bold uppercase tracking-widest flex items-center justify-center gap-2 sm:gap-3 cursor-pointer min-h-[44px]"
                        >
                        <ZapIcon className="w-4 sm:w-5 h-4 sm:h-5 text-tether-teal" />
                        <span className="hidden sm:inline">Initialize WDK Agent</span>
                        <span className="sm:hidden">Initialize</span>
                      </motion.button>
                    )}
                  </ConnectButton.Custom>
                </div>
              </div>

              {/* Secondary Info */}
              <p className="text-xs text-neutral-gray text-center">
                <span className="hidden sm:inline">Powered by Tether WDK • Ethereum Sepolia • Solana • TON</span>
                <span className="sm:hidden">Tether WDK • Multi-chain</span>
              </p>
            </motion.div>
          </div>

            {/* Right Column: Feature Showcase */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.3, duration: prefersReducedMotion ? 0 : 0.5 }}
              className="relative hidden md:block"
            >
            {/* Animated Background Glow */}
            <motion.div 
              className="absolute inset-0 bg-gradient-to-br from-tether-teal/30 via-transparent to-cyan-400/20 blur-[80px] sm:blur-[100px] lg:blur-[120px] rounded-full"
              animate={prefersReducedMotion ? {} : { 
                scale: [1, 1.1, 1],
                opacity: [0.5, 0.7, 0.5]
              }}
              transition={prefersReducedMotion ? {} : { duration: 8, repeat: Infinity, ease: "easeInOut" }}
            ></motion.div>

            {/* Glass Card Container */}
            <div className="relative backdrop-blur-xl bg-white/5 p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-white/10 shadow-2xl">
              {/* Gradient Border Effect */}
              <div className="absolute inset-0 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-tether-teal/20 via-transparent to-cyan-400/20 pointer-events-none"></div>

              {/* Features Grid */}
              <motion.div 
                className="relative grid grid-cols-2 gap-3 sm:gap-4"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {features.map((item, i) => (
                  <motion.div 
                    key={i} 
                    variants={cardVariants}
                    whileHover={prefersReducedMotion ? {} : { 
                      scale: 1.05, 
                      y: -4,
                      transition: { duration: 0.2 }
                    }}
                    className="group p-3 sm:p-4 rounded-lg sm:rounded-xl bg-gradient-to-br from-white/8 to-white/3 border border-white/10 hover:border-white/20 transition-all duration-300 flex flex-col gap-2 sm:gap-3 cursor-default"
                  >
                    {/* Icon Container with Gradient */}
                    <div className={`w-9 sm:w-10 h-9 sm:h-10 rounded-md sm:rounded-lg bg-gradient-to-br ${item.accent} opacity-10 group-hover:opacity-20 flex items-center justify-center text-white group-hover:scale-110 transition-transform duration-300`}>
                      <item.icon className="w-4 sm:w-5 h-4 sm:h-5" />
                    </div>

                    {/* Content */}
                    <div className="space-y-0.5">
                      <h3 className="text-white font-bold text-xs sm:text-sm leading-tight">{item.title}</h3>
                      <p className="text-neutral-gray text-xs leading-tight">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

               {/* Bottom Accent */}
               <motion.div 
                 className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-white/5"
                 initial={{ scaleX: 0 }}
                 animate={{ scaleX: 1 }}
                 transition={{ delay: prefersReducedMotion ? 0 : 1.2, duration: prefersReducedMotion ? 0 : 0.6 }}
               >
                <p className="text-xs text-neutral-gray text-center">
                  <span className="text-tether-teal font-semibold">No permission needed</span> • Start earning in seconds
                </p>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Mobile Feature Cards - Below on smaller screens */}
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"
        >
          {features.map((item, i) => (
            <motion.div 
              key={i} 
              variants={cardVariants}
              className="p-3 sm:p-4 rounded-lg sm:rounded-xl bg-gradient-to-br from-white/8 to-white/3 border border-white/10 flex flex-col gap-2 sm:gap-3"
            >
              <div className={`w-9 sm:w-10 h-9 sm:h-10 rounded-md sm:rounded-lg bg-gradient-to-br ${item.accent} opacity-10 flex items-center justify-center text-white`}>
                <item.icon className="w-4 sm:w-5 h-4 sm:h-5" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">{item.title}</h3>
                <p className="text-neutral-gray text-xs">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
