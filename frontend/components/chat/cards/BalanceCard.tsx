"use client";

import { MessageIntent } from "@/hooks/use-chat";
import { motion } from "framer-motion";
import { Wallet, RefreshCw, ChevronRight } from "lucide-react";

interface BalanceCardProps {
  intent: MessageIntent;
  messageId: string;
}

export function BalanceCard({ intent, messageId }: BalanceCardProps) {
  // Extract tokens from entities
  const tokens = intent.entities.filter(e => e.type === "token").map(e => e.value);
  
  // Mock balances
  const balances = tokens.length > 0 ? tokens.map(t => ({
    symbol: t,
    amount: (Math.random() * 10).toFixed(4),
    valueUsd: (Math.random() * 500).toFixed(2),
    change: (Math.random() * 5 - 2.5).toFixed(2)
  })) : [
    { symbol: "BNB", amount: "1.420", valueUsd: "852.00", change: "+2.4" },
    { symbol: "USDT", amount: "250.00", valueUsd: "250.00", change: "0.0" },
    { symbol: "FDUSD", amount: "10.05", valueUsd: "10.05", change: "+0.1" }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full group"
    >
      <div className="px-5 py-3 bg-white/[0.03] border-b border-white/5 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Wallet className="w-3.5 h-3.5 text-bnb-gold" />
          <h3 className="text-[10px] font-heading font-bold text-bnb-gold uppercase tracking-[0.2em]">Asset Intelligence</h3>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">Live</span>
        </div>
      </div>
      
      <div className="p-3">
        <div className="space-y-1">
          {balances.map((b, i) => (
            <motion.div 
              key={i} 
              whileHover={{ x: 2, backgroundColor: "rgba(255, 255, 255, 0.05)" }}
              className="flex items-center justify-between p-3 rounded-xl transition-colors cursor-pointer group/item"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-[11px] font-bold text-bnb-gold shadow-inner">
                  {b.symbol.slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-bold text-white group-hover/item:text-bnb-gold transition-colors">{b.symbol}</p>
                  <p className="text-[10px] text-gray-500 font-medium tracking-tight">BNB Smart Chain</p>
                </div>
              </div>
              
              <div className="text-right flex items-center gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-heading font-bold text-white">{b.amount}</p>
                  <div className="flex items-center justify-end gap-1.5">
                    <span className={clsx("text-[9px] font-bold", b.change.startsWith('+') ? "text-green-400" : "text-gray-500")}>
                      {b.change}%
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium">${b.valueUsd}</span>
                  </div>
                </div>
                <ChevronRight className="w-3 h-3 text-gray-600 group-hover/item:text-bnb-gold transition-colors" />
              </div>
            </motion.div>
          ))}
        </div>
        
        <div className="mt-3 p-3 pt-4 border-t border-white/5 flex justify-between items-center">
           <div className="flex items-center gap-1.5">
             <RefreshCw className="w-2.5 h-2.5 text-gray-600 animate-spin-slow" />
             <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Auto-Sync Active</p>
           </div>
           <button className="text-[9px] font-bold text-bnb-gold hover:text-white transition-colors cursor-pointer uppercase tracking-widest flex items-center gap-1">
             Manage Assets
           </button>
        </div>
      </div>
    </motion.div>
  );
}

import { clsx } from "clsx";
