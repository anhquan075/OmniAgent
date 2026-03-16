/**
 * Network configuration for WDKVault.
 * Single source of truth for network configuration.
 * Env vars override the preset fallbacks from contractAddresses.js.
 */
import { V2_TESTNET_PRESET } from "./contractAddresses.js";

export const NETWORK_MODE = {
  TESTNET: "testnet",
};

export const NETWORK_CONFIGS = {
  [NETWORK_MODE.TESTNET]: {
    label: "BNB Testnet",
    chainId: 97n,
    chainIdNum: 97,
    rpcUrl:
      import.meta.env.VITE_BSC_TESTNET_RPC_URL ||
      "https://bsc-testnet-rpc.publicnode.com",
    blockExplorer: "https://testnet.bscscan.com",
    nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
    vUSDTAddress: "0x5e68daa5deCdAB5a6bC97d2DB0E95adaD22E33e3", // Venus vUSDT BSC testnet
    contracts: {
      vaultAddress:
        import.meta.env.VITE_TESTNET_VAULT_ADDRESS ||
        V2_TESTNET_PRESET.vaultAddress,
      engineAddress:
        import.meta.env.VITE_TESTNET_ENGINE_ADDRESS ||
        V2_TESTNET_PRESET.engineAddress,
      tokenAddress:
        import.meta.env.VITE_TESTNET_TOKEN_ADDRESS ||
        V2_TESTNET_PRESET.tokenAddress,
      circuitBreakerAddress:
        import.meta.env.VITE_TESTNET_CIRCUIT_BREAKER_ADDRESS ||
        V2_TESTNET_PRESET.circuitBreakerAddress,
      sharpeTrackerAddress:
        import.meta.env.VITE_TESTNET_SHARPE_TRACKER_ADDRESS ||
        V2_TESTNET_PRESET.sharpeTrackerAddress,
      pegArbExecutorAddress:
        import.meta.env.VITE_TESTNET_PEG_ARB_EXECUTOR_ADDRESS ||
        V2_TESTNET_PRESET.pegArbExecutorAddress,
      riskPolicyAddress:
        import.meta.env.VITE_TESTNET_POLICY_ADDRESS ||
        V2_TESTNET_PRESET.riskPolicyAddress,
      wdkAdapterAddress:
        import.meta.env.VITE_TESTNET_WDK_ADAPTER_ADDRESS ||
        V2_TESTNET_PRESET.wdkAdapterAddress,
      secondaryAdapterAddress:
        import.meta.env.VITE_TESTNET_SECONDARY_ADAPTER_ADDRESS ||
        V2_TESTNET_PRESET.secondaryAdapterAddress,
      executionAuctionAddress:
        import.meta.env.VITE_TESTNET_EXECUTION_AUCTION_ADDRESS ||
        V2_TESTNET_PRESET.executionAuctionAddress,
    },
  },
};

/** Default mode — BNB Testnet */
export const DEFAULT_NETWORK_MODE = NETWORK_MODE.TESTNET;

export const STORAGE_KEY = "wdkvault_network_mode";
