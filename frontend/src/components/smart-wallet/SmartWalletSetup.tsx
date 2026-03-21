import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { callMcpTool } from '@/lib/mcp';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface SmartWalletSetupProps {
  userAddress: string;
  onSmartAccountReady: (address: string) => void;
}

export function SmartWalletSetup({ userAddress, onSmartAccountReady }: SmartWalletSetupProps) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'creating' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState<string>('');

  useEffect(() => {
    checkSmartAccount();
  }, [userAddress]);

  const checkSmartAccount = async () => {
    setStatus('checking');
    try {
      const response = await callMcpTool(userAddress, 'smartaccount_getAddress', {});
      if (response.result?.smartAccount && response.result.smartAccount !== '0x0000000000000000000000000000000000000000') {
        setStatus('ready');
        onSmartAccountReady(response.result.smartAccount);
      } else {
        setStatus('idle');
      }
    } catch (err) {
      console.error('Error checking smart account:', err);
      // If error, assume no account or allow retry
      setStatus('idle');
    }
  };

  const createSmartAccount = async () => {
    setStatus('creating');
    setError(null);
    setProgressStep('Initiating creation...');

    let progressTimer: NodeJS.Timeout | undefined;
    
    try {
      progressTimer = setInterval(() => {
        setProgressStep((prev) => {
          if (prev === 'Initiating creation...') return 'Deploying proxy...';
          if (prev === 'Deploying proxy...') return 'Verifying on-chain...';
          return prev;
        });
      }, 2000);

      const response = await callMcpTool(userAddress, 'smartaccount_create', {});

      if (response.error) {
        throw new Error(response.error.message || 'Failed to create smart account');
      }

      const address = response.result?.account;
      if (address) {
        setProgressStep('Smart Account Ready!');
        setStatus('ready');
        onSmartAccountReady(address);
      } else {
        throw new Error('No address returned');
      }
    } catch (err: any) {
      console.error('Error creating smart account:', err);
      setStatus('error');
      setError(err.message || 'Failed to create smart account');
    } finally {
      if (progressTimer) clearInterval(progressTimer);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#0B0E14]/80 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-6 max-w-sm w-full"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-tether-teal/10 text-tether-teal">
          <Shield className="w-5 h-5" />
        </div>
        <h3 className="font-heading text-sm font-bold text-white uppercase tracking-wider">
          Smart Wallet Setup
        </h3>
      </div>

      <AnimatePresence mode="wait">
        {status === 'checking' && (
          <motion.div
            key="checking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-8 space-y-3"
          >
            <Loader2 className="w-6 h-6 text-tether-teal animate-spin" />
            <p className="text-xs text-neutral-gray font-mono">Checking account status...</p>
          </motion.div>
        )}

        {status === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <p className="text-xs text-neutral-gray leading-relaxed">
              Enable your AI agent to execute transactions autonomously within set limits. 
              Requires a one-time setup to deploy your smart account.
            </p>
            
            <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <CheckCircle className="w-3.5 h-3.5 text-tether-teal" />
                <span>Non-custodial & Secure</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <CheckCircle className="w-3.5 h-3.5 text-tether-teal" />
                <span>Set daily spending limits</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <CheckCircle className="w-3.5 h-3.5 text-tether-teal" />
                <span>Revoke permissions anytime</span>
              </div>
            </div>

            <Button
              onClick={createSmartAccount}
              className="w-full bg-tether-teal hover:bg-tether-teal/90 text-black font-heading font-bold text-xs uppercase tracking-widest py-4 shadow-glow-sm flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Enable Smart Wallet
            </Button>
          </motion.div>
        )}

        {status === 'creating' && (
          <motion.div
            key="creating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6 py-4"
          >
            <div className="relative h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="absolute top-0 left-0 h-full bg-tether-teal"
                initial={{ width: "0%" }}
                animate={{ width: "70%" }}
                transition={{ duration: 2, ease: "easeInOut" }}
              />
            </div>
            
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-tether-teal animate-spin" />
              <p className="text-xs text-tether-teal font-heading font-bold uppercase tracking-widest animate-pulse">
                {progressStep}
              </p>
              <p className="text-[10px] text-neutral-gray text-center max-w-[200px]">
                Please verify the transaction in your wallet to deploy the smart account.
              </p>
            </div>
          </motion.div>
        )}

        {status === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-red-400 uppercase tracking-wide mb-1">Deployment Failed</h4>
                <p className="text-[10px] text-red-300/80 leading-relaxed">
                  {error || "An unexpected error occurred while creating the smart account."}
                </p>
              </div>
            </div>
            
            <Button
              onClick={createSmartAccount}
              className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-heading font-bold text-xs uppercase tracking-widest py-3"
            >
              Try Again
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
