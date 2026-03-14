import React from 'react';
import { motion } from 'framer-motion';
import { Share2Icon, ExternalLinkIcon, ArrowRightIcon } from 'lucide-react';

interface BridgeCardProps {
  asset: {
    amount: string;
    symbol: string;
    logo?: string;
  };
  fromChain: {
    name: string;
    logo?: string;
  };
  toChain: {
    name: string;
    logo?: string;
  };
  estimatedTime: string;
  txHash?: string;
}

export const BridgeCard: React.FC<BridgeCardProps> = ({ asset, fromChain, toChain, estimatedTime, txHash }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-sm rounded-2xl bg-white/5 border border-white/10 p-4 shadow-xl backdrop-blur-md"
    >
      <div className="flex items-center gap-2 mb-4 text-[10px] font-heading font-bold text-cyber-cyan uppercase tracking-widest">
        <div className="w-2 h-2 rounded-full bg-cyber-cyan animate-pulse" />
        Cross-Chain Bridge
      </div>
      
      <div className="flex flex-col gap-4">
        {/* Asset Info */}
        <div className="flex items-center justify-center gap-3 py-2 border-b border-white/5">
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center overflow-hidden border border-white/10 p-1">
            {asset.logo ? <img src={asset.logo} className="w-full h-full object-contain" alt="" /> : <div className="text-xs font-bold">{asset.symbol[0]}</div>}
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold text-white leading-none">{asset.amount}</span>
            <span className="text-[10px] text-neutral-gray-light uppercase tracking-widest">{asset.symbol}</span>
          </div>
        </div>

        {/* Chain Flow */}
        <div className="flex items-center justify-between gap-4 px-2">
          <div className="flex flex-col items-center gap-2 flex-1">
            <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center overflow-hidden border border-white/5 p-1.5">
              {fromChain.logo ? <img src={fromChain.logo} className="w-full h-full object-contain" alt="" /> : <div className="text-[8px]">{fromChain.name[0]}</div>}
            </div>
            <span className="text-[9px] font-heading text-neutral-gray uppercase tracking-tighter">{fromChain.name}</span>
          </div>

          <div className="flex flex-col items-center flex-1">
            <div className="w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent relative">
              <ArrowRightIcon className="w-3 h-3 text-cyber-cyan absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 flex-1">
            <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center overflow-hidden border border-white/5 p-1.5">
              {toChain.logo ? <img src={toChain.logo} className="w-full h-full object-contain" alt="" /> : <div className="text-[8px]">{toChain.name[0]}</div>}
            </div>
            <span className="text-[9px] font-heading text-neutral-gray uppercase tracking-tighter">{toChain.name}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/10">
        <div className="flex justify-between text-[9px] font-mono">
          <span className="text-neutral-gray lowercase">Est. Time:</span>
          <span className="text-white">~{estimatedTime}</span>
        </div>
      </div>

      {txHash ? (
        <a 
          href={`https://scan.wdk.io/tx/${txHash}`} 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-full mt-4 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white text-[10px] font-heading font-bold py-2.5 rounded-xl transition-all border border-white/10 group"
        >
          TRACK SHIPMENT
          <ExternalLinkIcon className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </a>
      ) : (
        <button className="w-full mt-4 bg-cyber-cyan hover:bg-cyber-cyan/90 text-space-black text-[10px] font-heading font-bold py-2.5 rounded-xl transition-all shadow-glow-sm">
          INITIATE BRIDGE
        </button>
      )}
    </motion.div>
  );
};
