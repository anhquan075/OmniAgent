import { motion } from 'framer-motion';
import { Droplets, Loader2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { useAutoFaucet } from '@/hooks/useAutoFaucet';
import { useAccount } from 'wagmi';

export function FaucetStatus() {
  const { isConnected } = useAccount();
  const {
    config,
    isClaiming,
    error,
    claim,
    canClaim,
    hasClaimed,
    status,
  } = useAutoFaucet();

  if (!isConnected) return null;

  const amounts = config?.amounts ?? status?.amounts ?? { usdt: '10000', eth: '0.005' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white/5 border-white/10"
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400">
          <Droplets size={14} />
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-semibold text-neutral-gray-light uppercase tracking-wider">
            Testnet Faucet
          </span>
          <span className="text-[8px] text-neutral-gray">
            {amounts.usdt} USDT + {amounts.eth} ETH
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {hasClaimed && !error ? (
          <div className="flex items-center gap-1.5 text-green-400">
            <CheckCircle size={12} />
            <span className="text-[9px] font-medium">Claimed</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-1.5 text-red-400">
            <AlertCircle size={12} />
            <span className="text-[9px] font-medium truncate max-w-[100px]">{error}</span>
          </div>
        ) : (
          <button
            onClick={claim}
            disabled={isClaiming || !canClaim}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-semibold transition-all disabled:opacity-50 bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 min-h-[28px]"
          >
            {isClaiming ? (
              <>
                <Loader2 size={10} className="animate-spin" />
                <span>Funding...</span>
              </>
            ) : (
              <>
                <Droplets size={10} />
                <span>Claim</span>
              </>
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}
