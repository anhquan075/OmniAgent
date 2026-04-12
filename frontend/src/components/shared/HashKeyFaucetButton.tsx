import { motion } from 'framer-motion';
import { Droplets, Loader2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useState, useEffect } from 'react';
import { formatEther, formatUnits } from 'viem';

const FAUCET_ABI = [
  {
    inputs: [],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'lastClaimTime',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'USDT_PER_CLAIM',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'HSK_PER_CLAIM',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const FAUCET_ADDRESS = import.meta.env.VITE_HASHKEY_FAUCET_ADDRESS as `0x${string}`;

export function HashKeyFaucetButton() {
  const { address, isConnected, chain } = useAccount();
  const [error, setError] = useState<string | null>(null);
  const [hasSubmittedClaim, setHasSubmittedClaim] = useState(false);

  if (!isConnected || chain?.id !== 133) return null;

  const { data: lastClaimTimeData, refetch: refetchLastClaimTime } = useReadContract({
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: 'lastClaimTime',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdtPerClaimData } = useReadContract({
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: 'USDT_PER_CLAIM',
  });

  const { data: hskPerClaimData } = useReadContract({
    address: FAUCET_ADDRESS,
    abi: FAUCET_ABI,
    functionName: 'HSK_PER_CLAIM',
  });

  const { writeContract, data: hash, isPending, isError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (isSuccess) {
      setHasSubmittedClaim(true);
      refetchLastClaimTime();
    }
  }, [isSuccess, refetchLastClaimTime]);

  useEffect(() => {
    if (isError) {
      setError('Claim failed');
      setHasSubmittedClaim(false);
    } else if (isSuccess) {
      setError(null);
    }
  }, [isError, isSuccess]);

  const hasClaimed = lastClaimTimeData !== undefined && lastClaimTimeData > 0n;
  const isClaiming = isPending || isConfirming;
  const showClaimed = hasSubmittedClaim || isSuccess || hasClaimed;

  const usdtAmount = usdtPerClaimData ? formatUnits(usdtPerClaimData, 6) : '1000';
  const hskAmount = hskPerClaimData ? formatEther(hskPerClaimData) : '0.001';

  const handleClaim = () => {
    if (hasClaimed) return;
    setError(null);
    writeContract({
      address: FAUCET_ADDRESS,
      abi: FAUCET_ABI,
      functionName: 'claim',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white/5 border-white/10"
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-[#00D395]/10 text-[#00D395]">
          <Droplets size={14} />
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-semibold text-neutral-gray-light uppercase tracking-wider">
            HashKey Faucet
          </span>
          <span className="text-[8px] text-neutral-gray">
            {usdtAmount} USDT + {hskAmount} HSK
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {error ? (
          <div className="flex items-center gap-1.5 text-red-400">
            <AlertCircle size={12} />
            <span className="text-[9px] font-medium truncate max-w-[100px]">{error}</span>
          </div>
        ) : isClaiming ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-semibold bg-[#00D395]/20 text-[#00D395] border border-[#00D395]/30 min-h-[28px]">
            <Loader2 size={10} className="animate-spin" />
            <span>Claiming...</span>
          </div>
        ) : showClaimed ? (
          <div className="flex items-center gap-1.5 text-green-400">
            <CheckCircle size={12} />
            <span className="text-[9px] font-medium">Claimed</span>
            {hash && (
              <a
                href={`https://testnet-explorer.hsk.xyz/tx/${hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00D395] hover:text-[#00D395]/80"
              >
                <ExternalLink size={10} />
              </a>
            )}
          </div>
        ) : (
          <button
            onClick={handleClaim}
            disabled={hasClaimed}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-[#00D395]/20 text-[#00D395] border border-[#00D395]/30 hover:bg-[#00D395]/30 hover:enabled:bg-[#00D395]/40 min-h-[28px]"
          >
            <Droplets size={10} />
            <span>Claim</span>
          </button>
        )}
      </div>
    </motion.div>
  );
}
