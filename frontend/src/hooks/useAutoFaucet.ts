import { useState, useCallback, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';
import { useAccount } from 'wagmi';

interface FaucetStatus {
  claimed: boolean;
  canClaim: boolean;
  nextAvailableAt?: string;
  amounts: {
    usdt: string;
    eth: string;
  };
}

interface FaucetConfig {
  amounts: {
    usdt: string;
    eth: string;
  };
  cooldownMs: number;
  minBalance: {
    usdt: string;
    eth: string;
  };
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
        const data = await res.json();
        setConfig(data);
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
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error('[useAutoFaucet] Status fetch failed:', e);
    }
  }, [address]);

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
        body: JSON.stringify({ address }),
      });

      const data = await res.json();

      if (!res.ok) {
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
