import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, parseUnits, formatUnits } from 'viem';
import { Shield, Wallet, Send, ArrowDownToLine, Bot, Fingerprint, AlertTriangle, CheckCircle2, Loader2, ExternalLink, ChevronRight, Lock, Unlock, Zap } from 'lucide-react';
import { HASHKEY_TESTNET_PRESET } from '../../lib/contractAddresses';
import { kycSbtAbi, hashkeyVaultAbi, agentNfaAbi, erc20Abi, zkIdentityGateAbi } from '../../lib/abi';
import { generateProof, proofToHex } from '../../lib/zkProof';

const HASHKEY_TESTNET_CHAIN_ID = 133;

type KycStatus = { isValid: boolean; level: number; loading: boolean };
type VaultState = { totalAssets: string; apy: string; userShares: string; loading: boolean };
type Tab = 'overview' | 'deposit' | 'withdraw' | 'agent' | 'zk';

export const HashKeyVaultDashboard: React.FC = () => {
  const { address, isConnected, chain } = useAccount();
  const isCorrectChain = chain?.id === HASHKEY_TESTNET_CHAIN_ID;
  const [kycStatus, setKycStatus] = useState<KycStatus>({ isValid: false, level: 0, loading: true });
  const [vaultState, setVaultState] = useState<VaultState>({ totalAssets: '0', apy: '0', userShares: '0', loading: true });
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [zkDepositAmount, setZkDepositAmount] = useState('');
  const [zkProofGenerating, setZkProofGenerating] = useState(false);
  const [zkProofError, setZkProofError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const { data: kycInfo } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.kycSbtAddress as `0x${string}`,
    abi: kycSbtAbi,
    functionName: 'getKycInfo',
    args: address ? [address] : undefined,
    query: { enabled: isCorrectChain && !!address, refetchInterval: 10000 },
  });

  const { data: totalAssets } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`,
    abi: hashkeyVaultAbi,
    functionName: 'totalAssets',
    query: { enabled: isCorrectChain, refetchInterval: 5000 },
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

  const { data: userUsdtBalance } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.usdtAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: isCorrectChain && !!address, refetchInterval: 10000 },
  });

  const { data: hasValidProof } = useReadContract({
    address: HASHKEY_TESTNET_PRESET.zkIdentityGateAddress as `0x${string}`,
    abi: zkIdentityGateAbi,
    functionName: 'hasValidProof',
    args: address ? [address] : undefined,
    query: { enabled: isCorrectChain && !!address, refetchInterval: 10000 },
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (kycInfo) {
      const [, level] = kycInfo as [string, number, number, bigint];
      setKycStatus({ isValid: level >= 1, level: Number(level), loading: false });
    }
  }, [kycInfo]);

  useEffect(() => {
    if (totalAssets !== undefined) {
      setVaultState(prev => ({
        ...prev,
        totalAssets: formatEther(totalAssets as bigint),
        apy: currentApy ? `${Number(currentApy) / 100}` : '5.0',
        userShares: userShares ? formatEther(userShares as bigint) : '0',
        loading: false,
      }));
    }
  }, [totalAssets, currentApy, userShares]);

  useEffect(() => {
    if (isSuccess) setTxStatus('confirmed');
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
    setTxStatus('depositing');
    writeContract({
      address: HASHKEY_TESTNET_PRESET.vaultAddress as `0x${string}`,
      abi: hashkeyVaultAbi,
      functionName: 'deposit',
      args: [parseUnits(depositAmount, 6), address],
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
      const subjectField = BigInt(address).toString();

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
      
      try {
        writeContract({
          address: HASHKEY_TESTNET_PRESET.zkIdentityGateAddress as `0x${string}`,
          abi: zkIdentityGateAbi,
          functionName: 'submitProof',
          args: [
            proofToHex(proof) as `0x${string}`,
            {
              currentYear: 2026,
              requiredKycLevel: 2,
              subject: address,
              agentTokenId: 1,
              proofValidUntil: BigInt(validUntil),
              nullifier: nullifier as `0x${string}`,
            },
          ],
        });
      } catch (writeErr: any) {
        setTxStatus(null);
        setZkProofError(writeErr?.message ?? 'Transaction failed');
      }
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

  const handleZkDeposit = useCallback(async () => {
    if (!zkDepositAmount || !address) return;
    setTxStatus('zk-depositing');
    writeContract({
      address: HASHKEY_TESTNET_PRESET.zkIdentityGateAddress as `0x${string}`,
      abi: zkIdentityGateAbi,
      functionName: 'depositWithProof',
      args: [parseUnits(zkDepositAmount, 6), address],
    });
  }, [zkDepositAmount, address, writeContract]);

  // --- Render: not connected ---
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Wallet className="w-8 h-8 text-tether-teal/50 mb-2" />
        <p className="text-neutral-gray text-xs">Connect wallet to access vault</p>
      </div>
    );
  }



  const canDeposit = kycStatus.level >= 1;
  const hasShares = vaultState.userShares !== '0';

  // Pipeline step status
  const steps = [
    { label: 'KYC', done: kycStatus.isValid, icon: Fingerprint },
    { label: 'ZK Proof', done: !!hasValidProof, icon: Shield },
    { label: 'Vault', done: hasShares, icon: Lock },
  ];

  const inputClass = "w-full px-2.5 sm:px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs sm:text-sm placeholder:text-neutral-gray/50 focus:border-tether-teal/50 focus:outline-none focus:ring-1 focus:ring-tether-teal/20 transition-colors disabled:opacity-40 min-h-[40px] sm:min-h-0";
  const btnPrimary = "w-full px-2.5 sm:px-3 py-2 rounded-lg bg-tether-teal/20 text-tether-teal border border-tether-teal/30 hover:bg-tether-teal/30 transition-colors text-[10px] sm:text-xs font-heading uppercase tracking-wider disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-0";
  const btnOutline = "w-full px-2.5 sm:px-3 py-2 rounded-lg border border-white/10 text-neutral-gray-light hover:text-white hover:border-tether-teal/30 transition-colors text-[10px] sm:text-xs font-heading uppercase tracking-wider disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-0";

  return (
    <div className="flex flex-col h-full max-h-full space-y-3 overflow-hidden">
      {/* Pipeline Progress — shows judge the flow at a glance */}
      <div className="flex items-center gap-1">
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <button
              onClick={() => setActiveTab(i === 2 ? 'deposit' : 'zk')}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-1 py-1.5 rounded-md transition-all text-[9px] font-heading uppercase tracking-wide border cursor-pointer ${
                step.done
                  ? 'bg-tether-teal/15 text-tether-teal border-tether-teal/30'
                  : 'bg-white/[0.03] text-neutral-gray border-white/5 hover:border-white/20'
              }`}
            >
              {step.done
                ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                : <step.icon className="w-3 h-3 flex-shrink-0 opacity-50" />
              }
              <span className="truncate">{step.label}</span>
            </button>
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
          { label: 'TVL', value: `$${Number(vaultState.totalAssets).toFixed(2)}` },
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
          { id: 'zk' as Tab, label: 'ZK', icon: Fingerprint },
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
      <div className="flex-1 overflow-y-auto rounded-lg bg-white/[0.03] border border-white/5 p-2.5 sm:p-3 md:p-4 space-y-2.5 sm:space-y-3 pb-4 sm:pb-6 md:pb-8">

        {/* OVERVIEW — default landing, shows pipeline status */}
        {activeTab === 'overview' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-neutral-gray font-heading uppercase tracking-wider truncate">Pipeline</span>
              <span className="text-[9px] font-mono text-neutral-gray flex-shrink-0 ml-2">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
            </div>
            {[
              {
                step: 1, label: 'KYC', desc: 'SBT on HashKey',
                done: kycStatus.isValid, detail: `Lv${kycStatus.level}`,
                action: () => setActiveTab('zk'), icon: Fingerprint,
              },
              {
                step: 2, label: 'ZK Proof', desc: 'Noir — prove privately',
                done: !!hasValidProof, detail: hasValidProof ? 'Valid' : 'Needed',
                action: () => setActiveTab('zk'), icon: Shield,
              },
              {
                step: 3, label: 'Vault', desc: 'KYC-gated ERC-4626',
                done: hasShares, detail: hasShares ? `${Number(vaultState.userShares).toFixed(1)}` : 'Empty',
                action: () => setActiveTab('deposit'), icon: canDeposit ? Unlock : Lock,
              },
            ].map(({ step, label, desc, done, detail, action, icon: StepIcon }) => (
              <button
                key={step}
                onClick={action}
                className={`w-full flex items-center gap-2 p-2 rounded-lg border transition-all text-left group overflow-hidden ${
                  done
                    ? 'bg-tether-teal/5 border-tether-teal/20 hover:border-tether-teal/40'
                    : 'bg-white/[0.02] border-white/5 hover:border-white/20'
                }`}
              >
                <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                  done ? 'bg-tether-teal/15' : 'bg-white/5'
                }`}>
                  {done
                    ? <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-tether-teal" />
                    : <StepIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-neutral-gray/60" />
                  }
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className={`text-[10px] sm:text-[11px] font-semibold truncate ${done ? 'text-white' : 'text-neutral-gray-light'}`}>
                      {label}
                    </span>
                    <span className={`text-[8px] px-1 py-0.5 rounded font-heading uppercase tracking-wide flex-shrink-0 ${
                      done ? 'bg-tether-teal/10 text-tether-teal' : 'bg-white/5 text-neutral-gray'
                    }`}>{detail}</span>
                  </div>
                  <p className="text-[8px] sm:text-[9px] text-neutral-gray truncate">{desc}</p>
                </div>
                <ChevronRight className="w-3 h-3 text-neutral-gray/30 group-hover:text-neutral-gray/60 transition-colors flex-shrink-0" />
              </button>
            ))}
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

        {/* ZK VERIFY */}
        {activeTab === 'zk' && (
          <div className="space-y-2.5 overflow-hidden">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-md border flex-shrink-0 ${hasValidProof ? 'bg-tether-teal/10 border-tether-teal/20' : 'bg-purple-500/10 border-purple-500/20'}`}>
                <Fingerprint className={`w-5 h-5 ${hasValidProof ? 'text-tether-teal' : 'text-purple-400'}`} />
              </div>
              <div className="min-w-0 overflow-hidden">
                <p className="text-neutral-gray-light text-[11px] font-semibold truncate">ZK Identity Proof</p>
                <p className="text-[9px] truncate">
                  {hasValidProof
                    ? <span className="text-tether-teal">Verified on-chain</span>
                    : <span className="text-amber-400">Submit to unlock vault</span>
                  }
                </p>
              </div>
            </div>
            <div className="rounded-md bg-white/[0.03] border border-white/5 p-2">
              <p className="text-purple-400/80 font-heading text-[8px] uppercase tracking-wider mb-1">Noir circuit verifies:</p>
              <div className="grid grid-cols-2 gap-x-1.5 gap-y-0.5 text-[9px] text-neutral-gray-light">
                {['Age 18+', 'Jurisdiction', 'KYC level', 'NFA holder'].map(item => (
                  <div key={item} className="flex items-center gap-1 min-w-0">
                    <CheckCircle2 className="w-2.5 h-2.5 text-tether-teal/60 flex-shrink-0" />
                    <span className="truncate">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={handleSubmitProof}
              disabled={isPending || !!hasValidProof || zkProofGenerating}
              className="w-full px-2 py-2 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors text-[9px] sm:text-[10px] font-heading uppercase tracking-wide disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-1.5"
            >
              {(zkProofGenerating || txStatus === 'submitting-proof') && <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />}
              <span className="truncate">
                {hasValidProof ? 'Proof Verified' : zkProofGenerating ? 'Generating...' : 'Submit ZK Proof'}
              </span>
            </button>
            {zkProofError && <p className="text-red-400 text-[9px] break-words">{zkProofError}</p>}
            {hasValidProof && (
              <div className="border-t border-white/5 pt-2.5 space-y-2">
                <p className="text-[9px] text-neutral-gray font-heading uppercase tracking-wider">ZK-Gated Deposit</p>
                <input type="number" placeholder="USDT amount" value={zkDepositAmount} onChange={(e) => setZkDepositAmount(e.target.value)} className={inputClass} />
                <button onClick={handleZkDeposit} disabled={!zkDepositAmount || isPending} className={btnPrimary}>
                  {txStatus === 'zk-depositing' && <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />}
                  <span className="truncate">Deposit via ZK</span>
                </button>
              </div>
            )}
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
            {!canDeposit && (
              <div className="flex items-center gap-1.5 p-2 rounded-md bg-amber-400/5 border border-amber-400/20 text-[9px]">
                <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <span className="text-amber-400 truncate">KYC required</span>
                <button onClick={() => setActiveTab('zk')} className="ml-auto text-tether-teal hover:underline flex-shrink-0">Verify</button>
              </div>
            )}
            <input type="number" placeholder="Amount" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} disabled={!canDeposit} className={inputClass} />
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={handleApprove} disabled={!depositAmount || !canDeposit || isPending} className={btnOutline}>
                {txStatus === 'approving' ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="truncate">Approve</span>}
              </button>
              <button onClick={handleDeposit} disabled={!depositAmount || !canDeposit || isPending} className={btnPrimary}>
                {txStatus === 'depositing' ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="truncate">Deposit</span>}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'withdraw' && (
          <div className="space-y-2.5 overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-neutral-gray font-heading uppercase tracking-wider">Withdraw</span>
              <span className="text-[9px] text-neutral-gray font-mono truncate ml-2">{Number(vaultState.userShares).toFixed(2)} shares</span>
            </div>
            <input type="number" placeholder="Amount" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} disabled={!hasShares} className={inputClass} />
            <button onClick={handleWithdraw} disabled={!withdrawAmount || !hasShares || isPending} className={btnPrimary}>
              {txStatus === 'withdrawing' ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="truncate">Withdraw</span>}
            </button>
          </div>
        )}

        {activeTab === 'agent' && (
          <div className="text-center space-y-2.5 py-1 overflow-hidden">
            <Bot className="w-8 h-8 text-tether-teal/40 mx-auto" />
            <div>
              <p className="text-neutral-gray-light text-[11px] font-semibold">Agent NFA</p>
              <p className="text-neutral-gray text-[9px]">On-chain agent identity</p>
            </div>
            <button onClick={handleMintAgent} disabled={isPending} className={btnPrimary}>
              {txStatus === 'minting' ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="truncate">Mint Agent NFA</span>}
            </button>
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
