import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeIcon, EyeOffIcon, RefreshCcwIcon, ExternalLink } from 'lucide-react';

const TOKEN_ADDRESS = import.meta.env.VITE_TESTNET_TOKEN_ADDRESS as `0x${string}`;
const BLOCK_EXPLORER = 'https://testnet.bscscan.com';

interface WDKBalanceProps {
  amount: number;
  symbol: string;
  fiatRate?: number;
  className?: string;
  logo?: string;
  onRefresh?: () => void;
}

export const WDKBalance: React.FC<WDKBalanceProps> = ({ 
  amount, 
  symbol, 
  fiatRate = 1.0, 
  className = "",
  logo,
  onRefresh
}) => {
  const [isMasked, setIsMasked] = useState(false);
  const [viewMode, setViewMode] = useState<'crypto' | 'fiat'>('crypto');

  const displayAmount = viewMode === 'crypto' 
    ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : (amount * fiatRate).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center justify-between group">
        <span className="text-[8px] font-heading text-neutral-gray uppercase tracking-[0.2em]">
          {viewMode === 'crypto' ? `${symbol} Balance` : 'Net Value (USD)'}
        </span>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRefresh && (
            <button 
              onClick={onRefresh}
              className="p-1 rounded hover:bg-white/5 text-neutral-gray hover:text-tether-teal transition-colors"
              title="Refresh balance"
            >
              <RefreshCcwIcon className="w-3 h-3" />
            </button>
          )}
          <button 
            onClick={() => setIsMasked(!isMasked)}
            className="p-1 rounded hover:bg-white/5 text-neutral-gray hover:text-tether-teal transition-colors"
            title={isMasked ? "Show Balance" : "Hide Balance"}
          >
            {isMasked ? <EyeIcon className="w-3 h-3" /> : <EyeOffIcon className="w-3 h-3" />}
          </button>
          <button 
            onClick={() => setViewMode(viewMode === 'crypto' ? 'fiat' : 'crypto')}
            className="p-1 rounded hover:bg-white/5 text-neutral-gray hover:text-cyber-cyan transition-colors"
            title="Toggle USD/Crypto"
          >
            <RefreshCcwIcon className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex items-baseline gap-2 relative">
        {logo && (
          <img src={logo} alt={symbol} className="w-4 h-4 object-contain" />
        )}
        
        <AnimatePresence mode="wait">
          <motion.div
            key={isMasked ? 'masked' : viewMode}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="text-2xl font-heading font-bold tracking-tight text-white"
          >
            {isMasked ? (
              <span className="tracking-[0.3em]">••••••</span>
            ) : (
              <>
                <span className={viewMode === 'fiat' ? 'text-tether-teal' : 'text-white'}>
                  {displayAmount}
                </span>
                {viewMode === 'crypto' && !isMasked && (
                  <span className="text-[10px] ml-1.5 text-neutral-gray-light font-normal uppercase tracking-widest">
                    {symbol}
                  </span>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
