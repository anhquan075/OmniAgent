import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUpIcon, ExternalLinkIcon, ShieldCheckIcon } from 'lucide-react';

interface DepositCardProps {
  asset: {
    amount: string;
    symbol: string;
    logo?: string;
  };
  protocol: {
    name: string;
    logo?: string;
    apy: string;
  };
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  txHash?: string;
}

export const DepositCard: React.FC<DepositCardProps> = ({ asset, protocol, riskLevel, txHash }) => {
  const riskColor = riskLevel === 'LOW' ? 'text-neon-green' : riskLevel === 'MEDIUM' ? 'text-xaut-gold' : 'text-red-500';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-sm rounded-2xl bg-white/5 border border-white/10 p-4 shadow-xl backdrop-blur-md"
    >
      <div className="flex items-center gap-2 mb-4 text-[10px] font-heading font-bold text-xaut-gold uppercase tracking-widest">
        <div className="w-2 h-2 rounded-full bg-xaut-gold animate-pulse" />
        Yield Optimization
      </div>
      
      <div className="flex flex-col gap-4">
        {/* Main Content */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5 relative overflow-hidden">
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center overflow-hidden border border-white/10 p-1">
              {asset.logo ? <img src={asset.logo} className="w-full h-full object-contain" alt="" /> : <div className="text-xs font-bold">{asset.symbol[0]}</div>}
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-white leading-none">{asset.amount}</span>
              <span className="text-[10px] text-neutral-gray-light uppercase tracking-widest">{asset.symbol}</span>
            </div>
          </div>
          
          <div className="flex flex-col items-end relative z-10">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-neon-green/10 border border-neon-green/20">
              <TrendingUpIcon className="w-3 h-3 text-neon-green" />
              <span className="text-xs font-bold text-neon-green">{protocol.apy}%</span>
            </div>
            <span className="text-[8px] text-neutral-gray uppercase tracking-tighter mt-1">Est. APY</span>
          </div>

          <div className="absolute right-0 top-0 w-24 h-24 bg-neon-green/5 blur-2xl rounded-full -mr-12 -mt-12" />
        </div>

        {/* Protocol Details */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-white/10 flex items-center justify-center overflow-hidden p-0.5">
              {protocol.logo ? <img src={protocol.logo} className="w-full h-full object-contain" alt="" /> : <div className="text-[8px] font-bold">{protocol.name[0]}</div>}
            </div>
            <span className="text-[10px] font-bold text-white uppercase">{protocol.name}</span>
          </div>
          
          <div className="flex items-center gap-1.5">
            <ShieldCheckIcon className={`w-3 h-3 ${riskColor}`} />
            <span className={`text-[9px] font-heading font-bold ${riskColor}`}>{riskLevel} RISK</span>
          </div>
        </div>
      </div>

      {txHash ? (
        <a 
          href={`https://scan.wdk.io/tx/${txHash}`} 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-full mt-4 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white text-[10px] font-heading font-bold py-2.5 rounded-xl transition-all border border-white/10 group"
        >
          VIEW POSITION
          <ExternalLinkIcon className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </a>
      ) : (
        <button className="w-full mt-4 bg-xaut-gold hover:bg-xaut-gold/90 text-space-black text-[10px] font-heading font-bold py-2.5 rounded-xl transition-all shadow-glow-sm">
          EARN YIELD
        </button>
      )}
    </motion.div>
  );
};
