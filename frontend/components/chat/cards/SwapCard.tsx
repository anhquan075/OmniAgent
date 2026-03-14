import React from 'react';
import { motion } from 'framer-motion';
import { ArrowDownIcon, ExternalLinkIcon } from 'lucide-react';

interface SwapCardProps {
  input: {
    amount: string;
    symbol: string;
    logo?: string;
  };
  output: {
    amount: string;
    symbol: string;
    logo?: string;
  };
  route: string;
  slippage: string;
  txHash?: string;
}

export const SwapCard: React.FC<SwapCardProps> = ({ input, output, route, slippage, txHash }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-sm rounded-2xl bg-white/5 border border-white/10 p-4 shadow-xl backdrop-blur-md"
    >
      <div className="flex items-center gap-2 mb-4 text-[10px] font-heading font-bold text-tether-teal uppercase tracking-widest">
        <div className="w-2 h-2 rounded-full bg-tether-teal animate-pulse" />
        Proposed Swap
      </div>
      
      <div className="flex flex-col gap-2">
        {/* Input Section */}
        <div className="bg-black/40 rounded-xl p-3 flex justify-between items-center border border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center overflow-hidden border border-white/10">
              {input.logo ? <img src={input.logo} className="w-full h-full object-contain" alt="" /> : <div className="text-[10px] font-bold">{input.symbol[0]}</div>}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white leading-none">{input.amount}</span>
              <span className="text-[10px] text-neutral-gray-light">{input.symbol}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-center -my-3 z-10">
          <div className="bg-space-black border border-white/10 p-1.5 rounded-full shadow-glow-sm">
            <ArrowDownIcon className="w-3 h-3 text-tether-teal" />
          </div>
        </div>

        {/* Output Section */}
        <div className="bg-black/40 rounded-xl p-3 flex justify-between items-center border border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center overflow-hidden border border-white/10">
              {output.logo ? <img src={output.logo} className="w-full h-full object-contain" alt="" /> : <div className="text-[10px] font-bold">{output.symbol[0]}</div>}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white leading-none">~{output.amount}</span>
              <span className="text-[10px] text-neutral-gray-light">{output.symbol}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/10 flex flex-col gap-2">
        <div className="flex justify-between text-[9px] font-mono">
          <span className="text-neutral-gray lowercase">Route:</span>
          <span className="text-white uppercase">{route}</span>
        </div>
        <div className="flex justify-between text-[9px] font-mono">
          <span className="text-neutral-gray lowercase">Slippage:</span>
          <span className="text-neon-green">{slippage}%</span>
        </div>
      </div>

      {txHash ? (
        <a 
          href={`https://bscscan.com/tx/${txHash}`} 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-full mt-4 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white text-[10px] font-heading font-bold py-2.5 rounded-xl transition-all border border-white/10 group"
        >
          VIEW ON EXPLORER
          <ExternalLinkIcon className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </a>
      ) : (
        <button className="w-full mt-4 bg-tether-teal hover:bg-tether-teal/90 text-space-black text-[10px] font-heading font-bold py-2.5 rounded-xl transition-all shadow-glow-sm">
          APPROVE & EXECUTE
        </button>
      )}
    </motion.div>
  );
};
