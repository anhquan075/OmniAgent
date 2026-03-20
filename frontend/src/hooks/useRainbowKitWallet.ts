import { useEffect, useState } from 'react';
import { useAccount, useDisconnect, useWalletClient } from 'wagmi';
import { BrowserProvider } from 'ethers';

export function useRainbowKitWallet() {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);

  useEffect(() => {
    if (walletClient) {
      const ethersProvider = new BrowserProvider(walletClient.transport, 'any');
      ethersProvider.getSigner().then((ethersSigner) => {
        setProvider(ethersProvider);
        setSigner(ethersSigner);
      }).catch(() => {
        setProvider(null);
        setSigner(null);
      });
    } else {
      setProvider(null);
      setSigner(null);
    }
  }, [walletClient]);

  const shortWallet = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

  const networkChainId = chain?.id ? BigInt(chain.id) : null;

  const networkLabel = !networkChainId
    ? "Unknown"
    : networkChainId === 1n
    ? "Ethereum Mainnet"
    : networkChainId === 11155111n
    ? "Sepolia"
    : `Chain ${networkChainId}`;

  return {
    wallet: address || null,
    shortWallet,
    provider,
    signer,
    networkChainId,
    networkLabel,
    isConnected,
    disconnectWallet: disconnect,
  };
}
