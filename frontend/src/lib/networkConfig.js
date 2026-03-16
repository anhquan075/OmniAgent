import { V2_TESTNET_PRESET, V2_MAINNET_PRESET } from "./contractAddresses.js";

export const NETWORK_MODE = {
  TESTNET: "testnet",
  MAINNET: "mainnet",
};

export const BLOCK_EXPLORERS = {
  TESTNET: import.meta.env.VITE_TESTNET_BLOCK_EXPLORER || "https://testnet.bscscan.com",
  MAINNET: import.meta.env.VITE_MAINNET_BLOCK_EXPLORER || "https://bscscan.com",
  WDK: import.meta.env.VITE_WDK_BLOCK_EXPLORER || "https://scan.wdk.io",
};

export const NETWORK_CONFIGS = {
  [NETWORK_MODE.TESTNET]: {
    label: "BNB Testnet",
    chainId: 97n,
    chainIdNum: 97,
    rpcUrl:
      import.meta.env.VITE_BSC_TESTNET_RPC_URL ||
      "https://bsc-testnet-rpc.publicnode.com",
    blockExplorer: BLOCK_EXPLORERS.TESTNET,
    nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
    vUSDTAddress: import.meta.env.VITE_TESTNET_VUSDT_ADDRESS || "0x5e68daa5deCdAB5a6bC97d2DB0E95adaD22E33e3",
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
  [NETWORK_MODE.MAINNET]: {
    label: "BNB Mainnet",
    chainId: 56n,
    chainIdNum: 56,
    rpcUrl:
      import.meta.env.VITE_BSC_MAINNET_RPC_URL ||
      "https://binance.llamarpc.com",
    blockExplorer: BLOCK_EXPLORERS.MAINNET,
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    vUSDTAddress: import.meta.env.VITE_MAINNET_VUSDT_ADDRESS || "0xfD5840cd36d94D7B241fa0e21099d78e8638d98d",
    contracts: {
      vaultAddress:
        import.meta.env.VITE_MAINNET_VAULT_ADDRESS ||
        V2_MAINNET_PRESET.vaultAddress,
      engineAddress:
        import.meta.env.VITE_MAINNET_ENGINE_ADDRESS ||
        V2_MAINNET_PRESET.engineAddress,
      tokenAddress:
        import.meta.env.VITE_MAINNET_TOKEN_ADDRESS ||
        V2_MAINNET_PRESET.tokenAddress,
      circuitBreakerAddress:
        import.meta.env.VITE_MAINNET_CIRCUIT_BREAKER_ADDRESS ||
        V2_MAINNET_PRESET.circuitBreakerAddress,
      sharpeTrackerAddress:
        import.meta.env.VITE_MAINNET_SHARPE_TRACKER_ADDRESS ||
        V2_MAINNET_PRESET.sharpeTrackerAddress,
      pegArbExecutorAddress:
        import.meta.env.VITE_MAINNET_PEG_ARB_EXECUTOR_ADDRESS ||
        V2_MAINNET_PRESET.pegArbExecutorAddress,
      riskPolicyAddress:
        import.meta.env.VITE_MAINNET_POLICY_ADDRESS ||
        V2_MAINNET_PRESET.riskPolicyAddress,
      wdkAdapterAddress:
        import.meta.env.VITE_MAINNET_WDK_ADAPTER_ADDRESS ||
        V2_MAINNET_PRESET.wdkAdapterAddress,
      secondaryAdapterAddress:
        import.meta.env.VITE_MAINNET_SECONDARY_ADAPTER_ADDRESS ||
        V2_MAINNET_PRESET.secondaryAdapterAddress,
      executionAuctionAddress:
        import.meta.env.VITE_MAINNET_EXECUTION_AUCTION_ADDRESS ||
        V2_MAINNET_PRESET.executionAuctionAddress,
    },
  },
};

export const DEFAULT_NETWORK_MODE = NETWORK_MODE.TESTNET;

export const STORAGE_KEY = "wdkvault_network_mode";
