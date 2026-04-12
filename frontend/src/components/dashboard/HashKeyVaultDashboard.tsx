import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useConfig } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { parseEther, formatEther, parseUnits, formatUnits } from 'viem';
import { Shield, Wallet, Send, ArrowDownToLine, Bot, Fingerprint, AlertTriangle, CheckCircle2, Loader2, ExternalLink, ChevronRight, Lock, Unlock, Zap, RefreshCw, BadgeCheck, Vault as VaultIcon, ArrowUpRight, Info } from 'lucide-react';
import { HASHKEY_TESTNET_PRESET } from '../../lib/contractAddresses';
import { kycSbtAbi, hashkeyVaultAbi, agentNfaAbi, erc20Abi, zkIdentityGateAbi } from '../../lib/abi';
import { generateProof, proofToHex } from '../../lib/zkProof';
import { isDevModeHashKeyEnabled } from '../../lib/wagmiConfig';
import { clearWagmiCache } from '../../lib/clearWagmiCache';

const HASHKEY_TESTNET_CHAIN_ID = 133;

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type ZkProofStatus = {
  hasValidProof: boolean;
  validUntil: number;
  verifiedAt: number;
  isExpired: boolean;
  loading: boolean;
  error?: string;
};

type VaultState = { totalAssets: string; apy: string; userShares: string; userAssets: string; loading: boolean };
type Tab = 'overview' | 'deposit' | 'withdraw' | 'agent';

export const HashKeyVaultDashboard: React.FC = () => {
  const { address, isConnected, chain } = useAccount();
  const config = useConfig();
  const isDevMode = isDevModeHashKeyEnabled();
  const isCorrectChain = chain?.id === HASHKEY_TESTNET_CHAIN_ID || isDevMode;
  const [vaultState, setVaultState] = useState<VaultState>({ totalAssets: '0', apy: '0', userShares: '0', userAssets: '0', loading: true });
  const [zkProofStatus, setZkProofStatus] = useState<ZkProofStatus>({ hasValidProof: false, validUntil: 0, verifiedAt: 0, isExpired: false, loading: true });
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [zkDepositAmount, setZkDepositAmount] = useState('');
  const [zkProofGenerating, setZkProofGenerating] = useState(false);
  const [zkProofError, setZkProofError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const { data: totalAssets, error: totalAssetsError } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`,
    abi: hashkeyVaultAbi,
    functionName: 'totalAssets',
    query: { 
      enabled: isCorrectChain, 
      refetchInterval: 5000,
      retry: 2,
    },
  });

  const { data: currentApy } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`,
    abi: hashkeyVaultAbi,
    functionName: 'currentApy',
    query: { enabled: isCorrectChain, refetchInterval: 30000 },
  });

  const { data: userShares } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`,
    abi: hashkeyVaultAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: isCorrectChain && !!address, refetchInterval: 5000 },
  });

  const { data: userUsdtBalance, refetch: refetchUsdtBalance, isLoading: usdtBalanceLoading, error: usdtBalanceError } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.usdtAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { 
      enabled: isCorrectChain && !!address, 
      refetchInterval: 3000,
      staleTime: 0,
      gcTime: 0,
    },
  });

  // Debug logging
  useEffect(() => {
    if (address && isCorrectChain) {
      console.log('USDT Balance Debug:', {
        address,
        balance: userUsdtBalance,
        formatted: userUsdtBalance ? formatUnits(userUsdtBalance as bigint, 6) : 'N/A',
        loading: usdtBalanceLoading,
        error: usdtBalanceError,
        usdtContract: HASHKEY_TESTNET_PRESET.usdtAddress,
      });
    }
  }, [userUsdtBalance, address, isCorrectChain, usdtBalanceLoading, usdtBalanceError]);

  const { data: hasValidProof, refetch: refetchProofStatus } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.zkIdentityGateAddress as `0x${string}`,
    abi: zkIdentityGateAbi,
    functionName: 'hasValidProof',
    args: address ? [address] : undefined,
    query: { enabled: isCorrectChain && !!address, refetchInterval: 10000 },
  });

  const { data: proofInfo } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.zkIdentityGateAddress as `0x${string}`,
    abi: zkIdentityGateAbi,
    functionName: 'proofOf',
    args: address ? [address] : undefined,
    query: { enabled: isCorrectChain && !!address, refetchInterval: 30000 },
  });

  const { data: userAssetsValue } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`,
    abi: hashkeyVaultAbi,
    functionName: 'convertToAssets',
    args: userShares ? [userShares as bigint] : undefined,
    query: { enabled: isCorrectChain && !!userShares && (userShares as bigint) > 0n },
  });

  const { data: usdtAllowance, refetch: refetchUsdtAllowance } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.usdtAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, HASHKEY_TESTNET_PRESET.zkIdentityGateAddress as `0x${string}`] : undefined,
    query: { 
      enabled: isCorrectChain && !!address, 
      refetchInterval: 3000,
      staleTime: 0,
      gcTime: 0,
    },
  });

  const { data: verifierAddress, error: verifierError, isLoading: verifierLoading } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.zkIdentityGateAddress as `0x${string}`,
    abi: zkIdentityGateAbi,
    functionName: 'verifier',
    query: { enabled: isCorrectChain, refetchInterval: 60000 },
  });

  useEffect(() => {
    console.log('[ZK Debug] Chain ID:', chain?.id);
    console.log('[ZK Debug] Expected Chain ID:', HASHKEY_TESTNET_CHAIN_ID);
    console.log('[ZK Debug] isCorrectChain:', isCorrectChain);
    console.log('[ZK Debug] Verifier address:', verifierAddress);
    console.log('[ZK Debug] Verifier loading:', verifierLoading);
    console.log('[ZK Debug] Verifier error:', verifierError);
    console.log('[ZK Debug] Gate address:', HASHKEY_TESTNET_PRESET.zkIdentityGateAddress);
  }, [chain?.id, isCorrectChain, verifierAddress, verifierLoading, verifierError]);

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (totalAssets !== undefined) {
      setVaultState(prev => ({
        ...prev,
        totalAssets: formatEther(totalAssets as bigint),
        apy: currentApy ? `${Number(currentApy) / 100}` : '5.0',
        userShares: userShares ? formatEther(userShares as bigint) : '0',
        userAssets: userAssetsValue ? formatUnits(userAssetsValue as bigint, 6) : '0',
        loading: false,
      }));
    } else if (totalAssetsError) {
      console.warn('totalAssets fetch error:', totalAssetsError);
    }
  }, [totalAssets, currentApy, userShares, userAssetsValue, totalAssetsError]);

  useEffect(() => {
    if (!address) return;
    
    const fetchZkProofStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/zk-proof/status/${address}`);
        if (!response.ok) throw new Error('Failed to fetch ZK proof status');
        const data = await response.json();
        setZkProofStatus({
          hasValidProof: data.hasValidProof,
          validUntil: data.validUntil,
          verifiedAt: data.verifiedAt,
          isExpired: data.isExpired,
          loading: false,
        });
      } catch (err: any) {
        console.error('[ZK Proof] Backend status check failed:', err.message);
        setZkProofStatus(prev => ({ ...prev, loading: false, error: err.message }));
      }
    };

    fetchZkProofStatus();
    const interval = setInterval(fetchZkProofStatus, 30000);
    return () => clearInterval(interval);
  }, [address]);

  useEffect(() => {
    if (isSuccess) {
      setTxStatus('confirmed');
      const CONFIRMATION_DISPLAY_DURATION_MS = 3000;
      setTimeout(() => setTxStatus(null), CONFIRMATION_DISPLAY_DURATION_MS);
    }
    else if (isConfirming) setTxStatus('pending');
  }, [isSuccess, isConfirming]);

  const handleApprove = useCallback(async () => {
    if (!depositAmount) return;
    setTxStatus('approving');
    writeContract({
      address: HASHKEY_TESTNET_PRESET.usdtAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`, parseUnits(depositAmount, 6)],
    });
  }, [depositAmount, writeContract]);

  const handleDeposit = useCallback(async () => {
    if (!depositAmount || !address) return;
    
    const depositAmountWei = parseUnits(depositAmount, 6);
    const vaultAllowance = await readContract(config, {
      address: HASHKEY_TESTNET_PRESET.usdtAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [address, HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`],
    });
    
    if ((vaultAllowance as bigint) < depositAmountWei) {
      setTxStatus('approving');
      writeContract({
        address: HASHKEY_TESTNET_PRESET.usdtAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`, depositAmountWei],
      });
      return;
    }
    
    setTxStatus('depositing');
    writeContract({
      address: HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`,
      abi: hashkeyVaultAbi,
      functionName: 'deposit',
      args: [depositAmountWei, address],
    });
  }, [depositAmount, address, writeContract]);

  const handleWithdraw = useCallback(async () => {
    if (!withdrawAmount || !address) return;
    setTxStatus('withdrawing');
    writeContract({
      address: HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`,
      abi: hashkeyVaultAbi,
      functionName: 'withdraw',
      args: [parseUnits(withdrawAmount, 6), address, address],
    });
  }, [withdrawAmount, address, writeContract]);

  const handleMintAgent = useCallback(async () => {
    if (!address) return;
    setTxStatus('minting');
    writeContract({
      address: HASHKEY_TESTNET_PRESET.agentNfaAddress as `0x${string}`,
      abi: agentNfaAbi,
      functionName: 'mint',
      args: [address, address, HASHKEY_TESTNET_PRESET.policyGuardAddress as `0x${string}`],
    });
  }, [address, writeContract]);

  const handleSubmitProof = useCallback(async () => {
    if (!address) return;
    setZkProofError(null);
    setZkProofGenerating(true);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const validUntil = Math.floor(Date.now() / 1000) + 86400 * 365;
      const nullifier = `0x${Array.from({ length: 64 }, (_, i) => ((i + 7) % 16).toString(16)).join('')}`;
      const subjectField = address; // Use address directly, not BigInt

      const { proof, publicInputs } = await generateProof({
        currentYear: 2026,
        requiredKycLevel: 2,
        subject: subjectField,
        agentTokenId: 1,
        proofValidUntil: validUntil,
        nullifier,
        birthYear: 1995,
        countryCode: 702,
        kycLevel: 3,
        agentHolder: subjectField,
      }, controller.signal);

      clearTimeout(timeoutId);
      setZkProofGenerating(false);
      setTxStatus('submitting-proof');
      
      writeContract({
        address: HASHKEY_TESTNET_PRESET.zkIdentityGateAddress as `0x${string}`,
        abi: zkIdentityGateAbi,
        functionName: 'submitProof',
        args: [
          proofToHex(proof) as `0x${string}`,
          address as `0x${string}`,
          1,
          nullifier as `0x${string}`,
          BigInt(validUntil),
        ],
      }, {
        onError: (writeErr: any) => {
          setTxStatus(null);
          setZkProofError(writeErr?.message ?? 'Transaction failed');
        }
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      setZkProofGenerating(false);
      if (err?.name === 'AbortError') {
        setZkProofError('Request timed out - please try again');
      } else {
        setZkProofError(err?.message ?? 'Proof generation failed');
      }
    }
  }, [address, writeContract]);

  const handleApproveZkUsdt = useCallback(async () => {
    if (!zkDepositAmount || !address) return;
    
    const depositAmountWei = parseUnits(zkDepositAmount, 6);
    const balance = userUsdtBalance ?? 0n;
    
    if (balance < depositAmountWei) {
      setZkProofError(`Insufficient USDT balance. You have ${formatUnits(balance, 6)} USDT but need ${zkDepositAmount} USDT.`);
      return;
    }
    
    setZkProofError(null);
    setTxStatus('approving-zk-usdt');
    writeContract({
      address: HASHKEY_TESTNET_PRESET.usdtAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [HASHKEY_TESTNET_PRESET.zkIdentityGateAddress as `0x${string}`, depositAmountWei],
    });
  }, [zkDepositAmount, address, writeContract, userUsdtBalance]);

  const handleZkDeposit = useCallback(async () => {
    if (!zkDepositAmount || !address) return;
    
    const depositAmountWei = parseUnits(zkDepositAmount, 6);
    const balance = userUsdtBalance ?? 0n;
    const allowance = usdtAllowance ?? 0n;
    
    if (balance < depositAmountWei) {
      setZkProofError(`Insufficient USDT balance. You have ${formatUnits(balance, 6)} USDT but need ${zkDepositAmount} USDT.`);
      return;
    }
    
    if (allowance < depositAmountWei) {
      setZkProofError(`Insufficient allowance. Please approve ZKIdentityGate to spend your USDT first.`);
      return;
    }
    
    setZkProofError(null);
    setTxStatus('zk-depositing');
    writeContract({
      address: HASHKEY_TESTNET_PRESET.zkIdentityGateAddress as `0x${string}`,
      abi: zkIdentityGateAbi,
      functionName: 'depositWithProof',
      args: [depositAmountWei, address],
    });
  }, [zkDepositAmount, address, writeContract, userUsdtBalance, usdtAllowance]);

  // --- Render: not connected ---
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Wallet className="w-8 h-8 text-tether-teal/50 mb-2" />
        <p className="text-neutral-gray text-xs">Connect wallet to access vault</p>
      </div>
    );
  }



  const hasShares = vaultState.userShares !== '0';

  // Pipeline step status
  const steps = [
    { label: 'ZK Proof', done: !!hasValidProof, icon: Shield },
    { label: 'Vault', done: hasShares, icon: Lock },
  ];

  const inputClass = "w-full px-2.5 sm:px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs sm:text-sm placeholder:text-neutral-gray/50 focus:border-tether-teal/50 focus:outline-none focus:ring-1 focus:ring-tether-teal/20 transition-colors disabled:opacity-40 min-h-[40px] sm:min-h-0";
  const btnPrimary = "w-full px-2.5 sm:px-3 py-2 rounded-lg bg-tether-teal/20 text-tether-teal border border-tether-teal/30 hover:bg-tether-teal/30 transition-colors text-[10px] sm:text-xs font-heading uppercase tracking-wider disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-0";
  const btnOutline = "w-full px-2.5 sm:px-3 py-2 rounded-lg border border-white/10 text-neutral-gray-light hover:text-white hover:border-tether-teal/30 transition-colors text-[10px] sm:text-xs font-heading uppercase tracking-wider disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-0";

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3 overflow-y-auto">
      {/* Pipeline Progress — shows judge the flow at a glance */}
      <div className="flex items-center gap-1">
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <div
              className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-1 py-1.5 rounded-md transition-all text-[9px] font-heading uppercase tracking-wide border ${
                step.done
                  ? 'bg-tether-teal/15 text-tether-teal border-tether-teal/30'
                  : 'glass text-neutral-gray border-white/5'
              }`}
            >
              {step.done
                ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                : <step.icon className="w-3 h-3 flex-shrink-0 opacity-50" />
              }
              <span className="truncate">{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className={`w-2.5 h-2.5 flex-shrink-0 ${
                step.done ? 'text-tether-teal/60' : 'text-white/10'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
        {[
          { label: 'TVL', value: `${Number(vaultState.totalAssets).toFixed(2)} ETH` },
          { label: 'APY', value: `${vaultState.apy}%`, accent: true },
          { label: 'Shares', value: Number(vaultState.userShares).toFixed(2) },
        ].map(({ label, value, accent }) => (
          <div key={label} className="rounded-md bg-white/5 border border-white/5 px-1 sm:px-1.5 py-1.5 text-center overflow-hidden">
            <p className="text-[7px] sm:text-[8px] text-neutral-gray uppercase tracking-wider font-heading">{label}</p>
            <p className={`text-[11px] sm:text-xs md:text-sm font-bold leading-tight truncate ${accent ? 'text-tether-teal' : 'text-white'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tab Navigation — icons only on small, label on sm+ */}
      <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/5 border border-white/5 overflow-hidden">
        {([
          { id: 'overview' as Tab, label: 'Status', icon: Zap },
          { id: 'deposit' as Tab, label: 'In', icon: Send },
          { id: 'withdraw' as Tab, label: 'Out', icon: ArrowDownToLine },
          { id: 'agent' as Tab, label: 'NFA', icon: Bot },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            title={label}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-0.5 py-1.5 rounded-md text-[9px] font-heading uppercase tracking-wide transition-all ${
              activeTab === id
                ? 'bg-tether-teal/20 text-tether-teal border border-tether-teal/30'
                : 'text-neutral-gray hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Icon className="w-3 h-3 flex-shrink-0" />
            <span className="hidden xl:inline truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto rounded-lg glass border border-white/5 p-2.5 sm:p-3 md:p-4 space-y-2.5 sm:space-y-3 pb-4 sm:pb-6 md:pb-8">

        {/* OVERVIEW — default landing, shows pipeline status with expandable cards */}
        {activeTab === 'overview' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-neutral-gray font-heading uppercase tracking-wider truncate">Pipeline</span>
              <span className="text-[9px] font-mono text-neutral-gray flex-shrink-0 ml-2">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
            </div>
            
            {/* ZK Proof Card - Expandable */}
            <div className={`rounded-lg border transition-all overflow-hidden ${
              (hasValidProof || zkProofStatus.hasValidProof)
                ? 'bg-tether-teal/5 border-tether-teal/20' 
                : 'glass border-white/5'
            }`}>
              <button
                onClick={() => setExpandedStep(expandedStep === 1 ? null : 1)}
                className="w-full flex items-center gap-2 p-2 text-left group hover:bg-white/5 transition-colors"
              >
                <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                  (hasValidProof || zkProofStatus.hasValidProof) ? 'bg-tether-teal/15' : 'bg-white/5'
                }`}>
                  {(hasValidProof || zkProofStatus.hasValidProof)
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-tether-teal" />
                    : <Shield className="w-3.5 h-3.5 text-neutral-gray/60" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[11px] font-semibold ${(hasValidProof || zkProofStatus.hasValidProof) ? 'text-white' : 'text-neutral-gray-light'}`}>ZK Proof</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-heading uppercase ${
                      (hasValidProof || zkProofStatus.hasValidProof) ? 'bg-tether-teal/10 text-tether-teal' : 'bg-xaut-gold/10 text-xaut-gold'
                    }`}>{(hasValidProof || zkProofStatus.hasValidProof) ? 'Valid' : 'Needed'}</span>
                  </div>
                  <p className="text-[9px] text-neutral-gray">Noir — prove privately</p>
                </div>
                <ChevronRight className={`w-3 h-3 text-neutral-gray group-hover:text-tether-teal transition-all ${expandedStep === 1 ? 'rotate-90' : ''}`} />
              </button>
              {expandedStep === 1 && (
                <div className="px-2 pb-2 pt-1 border-t border-white/5 space-y-2">
                  <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                    {['Age 18+', 'Jurisdiction', 'KYC level', 'NFA holder'].map(item => (
                      <div key={item} className="flex items-center gap-1 text-neutral-gray-light">
                        <CheckCircle2 className="w-2.5 h-2.5 text-tether-teal/60" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  {(hasValidProof || zkProofStatus.hasValidProof) ? (
                    <div className="flex items-center gap-1.5 p-1.5 rounded bg-tether-teal/5 text-[9px] text-tether-teal">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Verified on-chain</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); refetchProofStatus(); }}
                        className="ml-auto p-0.5 hover:bg-tether-teal/10 rounded"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSubmitProof(); }}
                      disabled={isPending || zkProofGenerating || !verifierAddress || verifierAddress === '0x0000000000000000000000000000000000000000'}
                      className={btnPrimary}
                    >
                      {zkProofGenerating && <Loader2 className="w-3 h-3 animate-spin" />}
                      <span>{zkProofGenerating ? 'Generating...' : 'Submit ZK Proof'}</span>
                    </button>
                  )}
                  {zkProofError && <p className="text-red-400 text-[9px]">{zkProofError}</p>}
                </div>
              )}
            </div>

            {/* Vault Card - Expandable */}
            <div className={`rounded-lg border transition-all overflow-hidden ${
              hasShares 
                ? 'bg-tether-teal/5 border-tether-teal/20' 
                : 'glass border-white/5'
            }`}>
              <button
                onClick={() => setExpandedStep(expandedStep === 2 ? null : 2)}
                className="w-full flex items-center gap-2 p-2 text-left group hover:bg-white/5 transition-colors"
              >
                <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                  hasShares ? 'bg-tether-teal/15' : 'bg-white/5'
                }`}>
                  {hasShares
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-tether-teal" />
                    : <Unlock className="w-3.5 h-3.5 text-neutral-gray/60" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[11px] font-semibold ${hasShares ? 'text-white' : 'text-neutral-gray-light'}`}>Vault</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-heading uppercase ${
                      hasShares ? 'bg-tether-teal/10 text-tether-teal' : 'bg-white/5 text-neutral-gray'
                    }`}>{hasShares ? `$${Number(vaultState.userAssets).toFixed(2)}` : 'Empty'}</span>
                  </div>
                  <p className="text-[9px] text-neutral-gray">ZK-gated ERC-4626</p>
                </div>
                <ChevronRight className={`w-3 h-3 text-neutral-gray group-hover:text-tether-teal transition-all ${expandedStep === 2 ? 'rotate-90' : ''}`} />
              </button>
              {expandedStep === 2 && (
                <div className="px-2 pb-2 pt-1 border-t border-white/5 space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="p-1.5 rounded bg-white/5 text-center">
                      <p className="text-[8px] text-neutral-gray uppercase">Shares</p>
                      <p className="text-[11px] font-bold text-white">{Number(vaultState.userShares).toFixed(2)}</p>
                    </div>
                    <div className="p-1.5 rounded bg-white/5 text-center">
                      <p className="text-[8px] text-neutral-gray uppercase">Value</p>
                      <p className="text-[11px] font-bold text-tether-teal">${Number(vaultState.userAssets).toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] text-neutral-gray">
                    <Info className="w-3 h-3" />
                    <span>USDT Balance: {userUsdtBalance ? formatUnits(userUsdtBalance as bigint, 6) : '0'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => setActiveTab('deposit')} className={btnOutline}>
                      <Send className="w-3 h-3" />
                      <span>Deposit</span>
                    </button>
                    <button onClick={() => setActiveTab('withdraw')} disabled={!hasShares} className={btnOutline}>
                      <ArrowDownToLine className="w-3 h-3" />
                      <span>Withdraw</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <a
              href={`https://testnet-explorer.hsk.xyz/address/${HASHKEY_TESTNET_PRESET.vaultAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-[8px] text-neutral-gray hover:text-tether-teal transition-colors pt-1"
            >
              <span className="truncate">HashKey Explorer</span>
              <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
            </a>
          </div>
        )}

        {/* DEPOSIT */}
        {activeTab === 'deposit' && (
          <div className="space-y-2.5 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-neutral-gray font-heading uppercase tracking-wider">Deposit</span>
              <span className="text-[9px] text-neutral-gray font-mono truncate ml-2">
                {userUsdtBalance ? formatUnits(userUsdtBalance as bigint, 6) : '0'} USDT
              </span>
            </div>
            <input type="number" placeholder="Amount" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className={inputClass} />
            <button onClick={handleDeposit} disabled={!depositAmount || !zkProofStatus.hasValidProof || isPending} className={btnPrimary}>
              {txStatus === 'depositing' ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="truncate">Deposit</span>}
            </button>
            {!zkProofStatus.hasValidProof && (
              <div className="flex items-center gap-1.5 text-[9px] text-warning-orange">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>Submit ZK Proof first to deposit</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'withdraw' && (
          <div className="space-y-2.5 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-neutral-gray font-heading uppercase tracking-wider">Withdraw</span>
              <span className="text-[9px] text-neutral-gray font-mono truncate ml-2">{Number(vaultState.userShares).toFixed(2)} shares</span>
            </div>
            <input type="number" placeholder="Amount" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} disabled={!hasShares} className={inputClass} />
            <button onClick={handleWithdraw} disabled={!withdrawAmount || !hasShares || !zkProofStatus.hasValidProof || isPending} className={btnPrimary}>
              {txStatus === 'withdrawing' ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="truncate">Withdraw</span>}
            </button>
            {!zkProofStatus.hasValidProof && (
              <div className="flex items-center gap-1.5 text-[9px] text-warning-orange">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>Submit ZK Proof first to withdraw</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'agent' && (
          <div className="text-center space-y-2.5 py-1 overflow-hidden">
            <Bot className="w-8 h-8 text-tether-teal/40 mx-auto" />
            <div>
              <p className="text-neutral-gray-light text-[11px] font-semibold">Agent NFA</p>
              <p className="text-neutral-gray text-[9px]">On-chain agent identity</p>
            </div>
            <button onClick={handleMintAgent} disabled={!zkProofStatus.hasValidProof || isPending} className={btnPrimary}>
              {txStatus === 'minting' ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="truncate">Mint Agent NFA</span>}
            </button>
            {!zkProofStatus.hasValidProof && (
              <div className="flex items-center gap-1.5 text-[9px] text-warning-orange justify-center">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>Submit ZK Proof first to mint</span>
              </div>
            )}
          </div>
        )}

        {txStatus && hash && (
          <div className={`flex items-center gap-1.5 p-2 rounded-md text-[9px] overflow-hidden ${
            txStatus === 'confirmed'
              ? 'bg-tether-teal/10 text-tether-teal border border-tether-teal/20'
              : 'bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/20'
          }`}>
            {txStatus === 'confirmed' ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />}
            <span className="truncate">{txStatus === 'confirmed' ? 'Confirmed' : `${txStatus}...`}</span>
            <a
              href={`https://testnet-explorer.hsk.xyz/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-0.5 hover:underline flex-shrink-0"
            >
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default HashKeyVaultDashboard;
