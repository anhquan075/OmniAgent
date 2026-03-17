import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeIcon, EyeOffIcon, RefreshCcwIcon, Zap, ExternalLink } from 'lucide-react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';

const MINT_ABI = ['function mint(address to, uint256 amount) external'] as const;

const TOKEN_ADDRESS = import.meta.env.VITE_TESTNET_TOKEN_ADDRESS as `0x${string}`;
const BLOCK_EXPLORER = 'https://testnet.bscscan.com';

interface WDKBalanceProps {
  amount: number;
  symbol: string;
  fiatRate?: number;
  className?: string;
  logo?: string;
}

export const WDKBalance: React.FC<WDKBalanceProps> = ({ 
  amount, 
  symbol, 
  fiatRate = 1.0, 
  className = "" 
}) => {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending, data: hash } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: txSuccess } = useWaitForTransactionReceipt({ hash });
  const [isMasked, setIsMasked] = useState(false);
  const [viewMode, setViewMode] = useState<'crypto' | 'fiat'>('crypto');
  const [mintSuccess, setMintSuccess] = useState(false);

  useEffect(() => {
    if (txSuccess && hash) {
      setMintSuccess(true);
    }
  }, [txSuccess, hash]);

  const displayAmount = viewMode === 'crypto' 
    ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : (amount * fiatRate).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

  const handleMint = async () => {
    if (!isConnected || !address) {
      return;
    }
    setMintSuccess(false);
    try {
      writeContract({
        address: TOKEN_ADDRESS,
        abi: MINT_ABI,
        functionName: 'mint',
        args: [address, parseUnits('10000', 6)],
      });
    } catch (error) {
      console.error('Mint error:', error);
    }
  };

  const isMinting = isPending || isConfirming;
  const showMinted = mintSuccess || (hash && txSuccess);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center justify-between group">
        <span className="text-[8px] font-heading text-neutral-gray uppercase tracking-[0.2em]">
          {viewMode === 'crypto' ? `${symbol} Balance` : 'Net Value (USD)'}
        </span>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
        {(symbol === 'USDT' || symbol === 'USD₮') && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleMint}
              disabled={isMinting || !isConnected}
              title={!isConnected ? 'Connect wallet to mint' : 'Mint 10k test USDT'}
              className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold rounded-md border transition-all disabled:opacity-50"
              style={{
                background: isMinting ? 'rgba(234, 179, 8, 0.04)' : 'rgba(234, 179, 8, 0.12)',
                borderColor: 'rgba(234, 179, 8, 0.4)',
                color: '#FBBF24',
                cursor: isMinting || !isConnected ? 'not-allowed' : 'pointer',
              }}
            >
              <Zap size={11} />
              {isMinting ? 'Minting...' : showMinted ? 'Minted!' : 'Mint 10k USDT'}
            </button>
            <a
              href={`${BLOCK_EXPLORER}/address/${TOKEN_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              title="View USDT on explorer"
              className="p-1"
              style={{ color: 'rgba(251, 191, 36, 0.5)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={10} />
            </a>
          </div>
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
        
        {!isMasked && viewMode === 'crypto' && (
          <div className="flex items-center gap-2 ml-auto">
            <div className="text-[9px] font-mono text-neon-green">
              +2.4% <span className="opacity-40">24h</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
