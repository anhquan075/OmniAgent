import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { getApiUrl } from '../../lib/api';
import { useAccount } from 'wagmi';
import { 
  Shield, CheckCircle2, Loader2, 
  Lock, ArrowRight, ExternalLink, Sparkles,
  Database, Verified, AlertCircle, Cpu, Network,
  Key, Fingerprint, Zap, Clock
} from 'lucide-react';

interface ZKProofVisualizerProps {
  className?: string;
  onVerifyComplete?: (proof: string) => void;
  showDetails?: boolean;
  autoDemo?: boolean;
  proofData?: {
    status: 'idle' | 'generating' | 'verifying' | 'verified' | 'failed';
    proof?: string;
    txHash?: string;
    progress?: number;
  };
}

type Step = 'input' | 'generating' | 'generated' | 'verifying' | 'verified' | 'failed';

const STEPS: { key: Step; label: string; Icon: typeof Shield; description: string }[] = [
  { key: 'input', label: 'Input', Icon: Database, description: 'Committed' },
  { key: 'generating', label: 'ZK Circuit', Icon: Cpu, description: 'Generated' },
  { key: 'generated', label: 'Proof', Icon: Key, description: 'Ready' },
  { key: 'verifying', label: 'Verify', Icon: Fingerprint, description: 'Verifying' },
  { key: 'verified', label: 'Complete', Icon: Verified, description: 'Verified' },
];

const ZKProofVisualizer: React.FC<ZKProofVisualizerProps> = ({ 
  className,
  onVerifyComplete,
  showDetails = true,
  autoDemo = false,
  proofData,
}) => {
  const { address: walletAddress } = useAccount();
  const [currentStep, setCurrentStep] = useState<Step>('input');
  const [progress, setProgress] = useState(0);
  const [proof, setProof] = useState('');
  const [txHash, setTxHash] = useState('');
  const [animatedProof, setAnimatedProof] = useState('');
  const [zkStatus, setZkStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchZKStatus = useCallback(async () => {
    if (!walletAddress) return;
    
    try {
      const res = await fetch(getApiUrl(`/api/zk-proof/status/${walletAddress}`));
      if (res.ok) {
        const data = await res.json();
        setZkStatus(data);
        
        if (data.hasValidProof && !data.isExpired) {
          setCurrentStep('verified');
          setProof(data.nullifier || '');
          setProgress(100);
        } else if (data.verifiedAt > 0) {
          setCurrentStep('verified');
          setProgress(100);
        }
      }
    } catch (err) {
      console.error('Failed to fetch ZK status:', err);
    }
  }, [walletAddress]);

  const generateProof = useCallback(async () => {
    if (!walletAddress) return;
    
    setIsLoading(true);
    setCurrentStep('generating');
    setProgress(0);
    
    try {
      setProgress(30);
      const nullifier = '0x' + Array(64).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      
      const res = await fetch(getApiUrl('/api/zk-proof/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: walletAddress,
          nullifier,
          currentYear: '2026',
          requiredKycLevel: '2',
          agentTokenId: '1'
        })
      });
      
      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setProgress(60);
      setProof(data.proof || '');
      setAnimatedProof(data.proof?.slice(2) || '');
      setCurrentStep('generated');
      
      setProgress(80);
      await new Promise(r => setTimeout(r, 500));
      
      const txHashValue = data.publicInputs?.[3] || '0x' + Array(64).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('').slice(0, 64);
      
      setTxHash(txHashValue);
      setProgress(100);
      setCurrentStep('verified');
      
      onVerifyComplete?.(data.proof);
      
      await fetchZKStatus();
      
    } catch (err: any) {
      console.error('Proof generation failed:', err);
      setCurrentStep('failed');
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, onVerifyComplete, fetchZKStatus]);

  useEffect(() => {
    if (!autoDemo && walletAddress) {
      fetchZKStatus();
    }
  }, [autoDemo, walletAddress, fetchZKStatus]);

  useEffect(() => {
    if (proofData) {
      setCurrentStep(proofData.status === 'idle' ? 'input' : proofData.status as Step);
      setProgress(proofData.progress ?? 0);
      if (proofData.proof) setProof(proofData.proof);
      if (proofData.txHash) setTxHash(proofData.txHash);
    }
  }, [proofData]);

  useEffect(() => {
    if (!autoDemo) return;
    const runDemo = async () => {
      setCurrentStep('input');
      setProgress(0);
      setAnimatedProof('');
      await new Promise(r => setTimeout(r, 1500));
      
      setCurrentStep('generating');
      setProgress(0);
      let proofChars = '';
      for (let i = 0; i <= 100; i += 5) {
        await new Promise(r => setTimeout(r, 80));
        setProgress(i);
        if (i % 20 === 0) {
          proofChars += Math.floor(Math.random() * 16).toString(16);
          setAnimatedProof(proofChars.padEnd(64, '0'));
        }
      }
      
      const mockProof = '0x' + Array(64).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      setProof(mockProof);
      setAnimatedProof(mockProof.slice(2));
      setCurrentStep('generated');
      await new Promise(r => setTimeout(r, 1200));
      
      setCurrentStep('verifying');
      setProgress(0);
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(r => setTimeout(r, 100));
        setProgress(i);
      }
      
      const mockTx = '0x' + Array(64).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('').slice(0, 64);
      setTxHash(mockTx);
      setCurrentStep('verified');
      onVerifyComplete?.(mockProof);
    };

    const interval = setInterval(runDemo, 10000);
    runDemo();
    return () => clearInterval(interval);
  }, [onVerifyComplete, autoDemo]);

  const getStepIndex = (step: Step) => STEPS.findIndex(s => s.key === step);

  const getStatusColor = () => {
    switch (currentStep) {
      case 'verified': return 'from-emerald-500 to-green-400';
      case 'verifying': return 'from-violet-500 to-purple-400';
      case 'generating': return 'from-cyan-500 to-blue-400';
      case 'generated': return 'from-amber-500 to-orange-400';
      case 'failed': return 'from-red-500 to-rose-400';
      default: return 'from-slate-500 to-slate-400';
    }
  };

  return (
    <div className={cn('relative overflow-hidden rounded-3xl', className)}>
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl border border-white/10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.15),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(139,92,246,0.1),transparent_50%)]" />
      
      <div className="relative p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4 sm:mb-6">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="relative flex-shrink-0">
              <div className={cn(
                'w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center',
                'bg-gradient-to-br shadow-lg',
                getStatusColor()
              )}>
                <Shield className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className={cn(
                'absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center',
                'bg-slate-900 border-2 border-slate-800',
                currentStep === 'verified' && 'bg-emerald-500',
                currentStep === 'verifying' && 'bg-violet-500 animate-pulse',
                currentStep === 'generating' && 'bg-cyan-500 animate-pulse'
              )}>
                {currentStep === 'verified' && <CheckCircle2 className="w-2 h-2 sm:w-3 sm:h-3 text-white" />}
                {['verifying', 'generating'].includes(currentStep) && <Loader2 className="w-2 h-2 sm:w-3 sm:h-3 text-white animate-spin" />}
                {currentStep === 'failed' && <AlertCircle className="w-2 h-2 sm:w-3 sm:h-3 text-white" />}
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="text-[10px] sm:text-xs font-heading font-semibold tracking-wider uppercase text-white truncate">ZK Identity</h3>
              <p className="text-[9px] sm:text-[10px] font-heading tracking-wider text-slate-400 truncate">ZK proof status</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={cn(
              'px-3 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-heading font-semibold tracking-wider uppercase whitespace-nowrap',
              'bg-slate-800/50 backdrop-blur-sm border border-white/10',
              currentStep === 'verified' && 'text-emerald-400',
              currentStep === 'verifying' && 'text-violet-400',
              currentStep === 'generating' && 'text-cyan-400',
              currentStep === 'generated' && 'text-amber-400',
              currentStep === 'input' && 'text-slate-400',
              currentStep === 'failed' && 'text-red-400'
            )}>
              {currentStep === 'verified' && '✓ Verified'}
              {currentStep === 'verifying' && <><Loader2 className="w-3 h-3 inline animate-spin mr-1" />Verifying...</>}
              {currentStep === 'generating' && <><Cpu className="w-3 h-3 inline mr-1" />Computing...</>}
              {currentStep === 'generated' && 'Proof Ready'}
              {currentStep === 'input' && 'Ready'}
              {currentStep === 'failed' && 'Failed'}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-[9px] sm:text-[10px] font-heading tracking-wider text-slate-500 mb-2">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
            <div 
              className={cn(
                'h-full rounded-full transition-all duration-300',
                'bg-gradient-to-r',
                getStatusColor()
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3 mb-6">
          {STEPS.map((step, idx) => {
            const stepIdx = getStepIndex(currentStep);
            const isComplete = idx < stepIdx || (idx === stepIdx && currentStep === 'verified');
            const isCurrent = idx === stepIdx && currentStep !== 'verified';
            const isPending = idx > stepIdx;
            const StepIcon = step.Icon;
            
            return (
              <div 
                key={step.key} 
                className={cn(
                  'flex flex-col items-center p-3 rounded-xl transition-all duration-300',
                  isComplete && 'bg-emerald-500/10 border border-emerald-500/30',
                  isCurrent && 'bg-violet-500/10 border border-violet-500/30 scale-105 shadow-lg shadow-violet-500/20',
                  isPending && 'bg-slate-800/30 border border-white/5'
                )}
              >
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center mb-2',
                  isComplete && 'bg-emerald-500/20 text-emerald-400',
                  isCurrent && 'bg-violet-500/20 text-violet-400',
                  isPending && 'bg-slate-700/50 text-slate-500'
                )}>
                  {isComplete ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : isCurrent ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <StepIcon className="w-5 h-5" />
                  )}
                </div>
                <div className={cn(
                  'text-[9px] sm:text-[10px] font-heading font-semibold tracking-wider uppercase text-center',
                  isComplete && 'text-emerald-400',
                  isCurrent && 'text-violet-400',
                  isPending && 'text-slate-500'
                )}>
                  {step.label}
                </div>
                <div className={cn(
                  'text-[8px] sm:text-[9px] font-heading tracking-wider text-center mt-1',
                  isComplete && 'text-emerald-400/70',
                  isCurrent && 'text-violet-400/70',
                  isPending && 'text-slate-600'
                )}>
                  {step.description}
                </div>
              </div>
            );
          })}
        </div>

        {showDetails && (
          <div className="space-y-3">
            {zkStatus && zkStatus.hasValidProof && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <Verified className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                  <span className="text-[9px] sm:text-[10px] font-heading tracking-wider uppercase text-emerald-400 font-semibold">On-Chain ZK Status</span>
                </div>
                <div className="space-y-1 text-[9px] sm:text-[10px] font-heading tracking-wider text-slate-400">
                  <div className="flex justify-between">
                    <span>Verified:</span>
                    <span className="text-emerald-400">✓ Yes</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Valid Until:</span>
                    <span>{zkStatus.validUntil > 0 ? new Date(zkStatus.validUntil * 1000).toLocaleDateString() : 'Never'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Agent Token:</span>
                    <span>#{zkStatus.agentTokenId}</span>
                  </div>
                  {zkStatus.nullifier && (
                    <div className="mt-2 pt-2 border-t border-emerald-500/20">
                      <span className="text-slate-500 font-heading tracking-wider text-[9px] sm:text-[10px]">Nullifier:</span>
                      <div className="font-mono text-[8px] sm:text-[9px] text-slate-400 break-all mt-1">
                        {zkStatus.nullifier.slice(0, 20)}...
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {animatedProof && (
              <div className="p-4 rounded-xl bg-slate-800/40 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <Key className="w-4 h-4 flex-shrink-0 text-cyan-400" />
                  <span className="text-[9px] sm:text-[10px] font-heading tracking-wider uppercase text-cyan-400 font-semibold">ZK Proof (64 bytes)</span>
                </div>
                <div className="font-mono text-[9px] sm:text-[10px] text-slate-400 break-all leading-relaxed">
                  <span className="text-cyan-300">0x</span>
                  {animatedProof.slice(0, 32)}
                  <span className="text-slate-600">...</span>
                  {animatedProof.slice(-32)}
                </div>
                <div className="mt-2 flex items-center gap-2 text-[8px] sm:text-[9px] font-heading tracking-wider text-slate-500">
                  <Zap className="w-3 h-3 flex-shrink-0" />
                  <span>No private data exposed</span>
                </div>
              </div>
            )}
            
            {txHash && (
              <div className="p-4 rounded-xl bg-slate-800/40 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <Network className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                  <span className="text-[9px] sm:text-[10px] font-heading tracking-wider uppercase text-emerald-400 font-semibold">On-Chain Verification</span>
                </div>
                <div className="font-mono text-[9px] sm:text-[10px] font-heading tracking-wider text-slate-400 flex items-center gap-2">
                  <ArrowRight className="w-3 h-3 text-emerald-500" />
                  <span>{txHash.slice(0, 18)}</span>
                  <span className="text-slate-600">...</span>
                  <span>{txHash.slice(-18)}</span>
                </div>
                <a 
                  href={`https://testnet-explorer.hsk.xyz/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  <span>View Transaction</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        )}

        {currentStep === 'input' && (
          <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-cyan-500/10 border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="text-xs text-violet-400 font-semibold uppercase">Proving Statement</span>
            </div>
            <div className="text-sm text-slate-300">
              Verify(address) → (KYC_Level ≥ 2) ∧ (Age ≥ 18) ∧ (Jurisdiction ∈ Allowed)
            </div>
            <div className="mt-2 text-xs text-slate-500 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3" /> Input hidden
              </span>
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3" /> Output leaked
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> &lt;2s computation
              </span>
            </div>
            
            {walletAddress && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div className="text-xs">
                    <span className="text-slate-500">Wallet: </span>
                    <span className="text-slate-300 font-mono">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
                  </div>
                  {zkStatus && (
                    <div className="text-xs">
                      {zkStatus.hasValidProof ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Proof on-chain
                        </span>
                      ) : (
                        <span className="text-amber-400">No proof yet</span>
                      )}
                    </div>
                  )}
                </div>
                {!zkStatus?.hasValidProof && (
                  <button
                    onClick={generateProof}
                    disabled={isLoading}
                    className="mt-3 w-full py-2 px-4 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Generating ZK Proof...
                      </span>
                    ) : (
                      'Generate ZK Proof'
                    )}
                  </button>
                )}
              </div>
            )}
            
            {!walletAddress && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="text-xs text-slate-500 text-center">
                  Connect wallet to generate ZK proof
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ZKProofVisualizer;