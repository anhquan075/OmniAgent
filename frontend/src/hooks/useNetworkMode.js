import { useState, useCallback } from "react";
import { NETWORK_MODE, DEFAULT_NETWORK_MODE } from "../lib/networkConfig.js";

/**
 * Simplified network mode hook.
 * Since only BNB Testnet is supported, this mostly returns static values.
 * Returns: { networkMode, isTestnet, toggleNetworkMode, setNetworkMode }
 */
export function useNetworkMode() {
  const [networkMode] = useState(DEFAULT_NETWORK_MODE);

  const setNetworkMode = useCallback((mode) => {
    // No-op as only one mode exists
  }, []);

  const toggleNetworkMode = useCallback(() => {
    // No-op as only one mode exists
  }, []);

  return {
    networkMode,
    isTestnet: true,
    isPolkadotHub: false,
    isCreditcoin: false,
    toggleNetworkMode,
    setNetworkMode,
  };
}
