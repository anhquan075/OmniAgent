import { useState, useCallback, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';
import { useAccount } from 'wagmi';

interface FaucetStatusResponse {
  eligible: boolean;
  lastClaim: {
    claimedAt: string;
    tokens: { usdt: string; eth: string };
  } | null;
}

interface FaucetStatus {
  canClaim: boolean;
  claimed: boolean;
  amounts: { usdt: string; eth: string };
}

interface FaucetConfigResponse {
  tokens: {
    usdt: { amount: string; decimals: number; address: string };
    eth: { amount: string; decimals: number };
  };
  limits: { perWallet: string; perIP: string; cooldown: string };
}

interface FaucetConfig {
  amounts: { usdt: string; eth: string };
  limits: { perWallet: string; perIP: string; cooldown: string };
}

export function useAutoFaucet() {
  const { address, isConnected } = useAccount();
  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [config, setConfig] = useState<FaucetConfig | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoClaimed, setHasAutoClaimed] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/faucet/config'));
      if (res.ok) {
        const data: FaucetConfigResponse = await res.json();
        setConfig({
          amounts: {
            usdt: data.tokens.usdt.amount,
            eth: data.tokens.eth.amount,
          },
          limits: data.limits,
        });
      }
    } catch (e) {
      console.error('[useAutoFaucet] Config fetch failed:', e);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!address) return;

    try {
      const res = await fetch(getApiUrl(`/api/faucet/status/${address}`));
      if (res.ok) {
        const data: FaucetStatusResponse = await res.json();
        setStatus({
          canClaim: data.eligible,
          claimed: !!data.lastClaim,
          amounts: config?.amounts ?? { usdt: '10000', eth: '0.005' },
        });
      }
    } catch (e) {
      console.error('[useAutoFaucet] Status fetch failed:', e);
    }
  }, [address, config?.amounts]);

  const claim = useCallback(async () => {
    if (!address || !isConnected) {
      setError('Wallet not connected');
      return { success: false, error: 'Wallet not connected' };
    }

    setIsClaiming(true);
    setError(null);

    try {
      const res = await fetch(getApiUrl('/api/faucet/claim'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403 && data.error?.includes('Already funded')) {
          setStatus(prev => prev ? { ...prev, canClaim: false, claimed: true } : null);
          return { success: true, txHash: undefined };
        }
        throw new Error(data.error || 'Claim failed');
      }

      await fetchStatus();
      return { success: true, txHash: data.txHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Claim failed';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setIsClaiming(false);
    }
  }, [address, isConnected, fetchStatus]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (address) {
      fetchStatus();
      setHasAutoClaimed(false);
    }
  }, [address, fetchStatus]);

  useEffect(() => {
    if (
      address &&
      isConnected &&
      status &&
      status.canClaim &&
      !status.claimed &&
      !isClaiming &&
      !hasAutoClaimed
    ) {
      setHasAutoClaimed(true);
      claim();
    }
  }, [address, isConnected, status, isClaiming, hasAutoClaimed, claim]);

  return {
    status,
    config,
    isClaiming,
    error,
    claim,
    refetchStatus: fetchStatus,
    canClaim: status?.canClaim ?? false,
    hasClaimed: status?.claimed ?? false,
  };
}
