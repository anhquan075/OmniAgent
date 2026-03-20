"use client";

import { motion } from "framer-motion";
import { Wallet, RefreshCw, ChevronRight, Activity, PieChart, ArrowRightLeft } from "lucide-react";
import { clsx } from "clsx";

interface BalanceCardProps {
  totalAssets?: string;
  bufferUtilizationBps?: number;
  bufferCurrent?: number;
  bufferTarget?: number;
  status?: string;
  assetSymbol?: string;
  vault?: string;
}

export function BalanceCard({ 
  totalAssets = "0.00", 
  bufferUtilizationBps = 2000, 
  status = "Healthy",
  assetSymbol = "USD₮"
}: BalanceCardProps) {
  // Calculate percentages
  const bufferPercent = (bufferUtilizationBps / 100).toFixed(1);
  const strategyPercent = (100 - (bufferUtilizationBps / 100)).toFixed(1);

  // Format total assets
  const formattedAssets = Number(totalAssets).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full group"
    >
      {/* Header */}
      <div className="px-5 py-3 bg-white/[0.03] border-b border-white/5 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Wallet className="w-3.5 h-3.5 text-yellow-500" />
          <h3 className="text-[10px] font-heading font-bold text-yellow-500 uppercase tracking-[0.2em]">WDK Portfolio</h3>
        </div>
        <div className="flex items-center gap-1">
          <span className={clsx("w-1.5 h-1.5 rounded-full", status === 'Healthy' ? "bg-green-500" : "bg-yellow-500")} />
          <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">Live</span>
        </div>
      </div>
      
      <div className="p-5">
        {/* Main Balance */}
        <div className="mb-6 flex justify-between items-end">
          <div className="space-y-1">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{assetSymbol} Balance</p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-3xl font-heading font-bold text-white">{formattedAssets}</h2>
              <span className="text-sm font-bold text-gray-400 mb-1">{assetSymbol}</span>
            </div>
          </div>
          <div className="flex flex-col items-end mb-1">
            <div className="flex items-center gap-1 bg-green-500/10 px-2 py-1 rounded-lg border border-green-500/20">
              <Activity className="w-3 h-3 text-green-400" />
              <span className="text-[10px] font-bold text-green-400">+2.4% 24h</span>
            </div>
          </div>
        </div>

        {/* Utilization Bars */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 text-cyber-cyan" />
                Buffer ({assetSymbol})
              </span>
              <span className="text-[11px] font-bold text-white">{bufferPercent}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${bufferPercent}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-cyber-cyan rounded-full"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
                <PieChart className="w-3 h-3 text-yellow-500" />
                Strategy Exposure
              </span>
              <span className="text-[11px] font-bold text-white">{strategyPercent}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${strategyPercent}%` }}
                transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
                className="h-full bg-yellow-500 rounded-full"
              />
            </div>
          </div>
        </div>
      </div>
        
      {/* Footer Button */}
      <div className="p-3 border-t border-white/5 bg-black/20">
        <button className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all flex items-center justify-between group/btn cursor-pointer">
          <span className="text-[10px] font-heading font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <ArrowRightLeft className="w-3.5 h-3.5 text-neutral-gray-light group-hover/btn:text-white transition-colors" />
            Manage Settlement Rails
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-gray-500 group-hover/btn:text-white group-hover/btn:translate-x-0.5 transition-all" />
        </button>
      </div>
    </motion.div>
  );
}
