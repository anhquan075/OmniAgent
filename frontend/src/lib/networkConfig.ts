import { V2_TESTNET_PRESET, V2_MAINNET_PRESET } from "./contractAddresses.js";

export const NETWORK_MODE = {
  TESTNET: "testnet",
  MAINNET: "mainnet",
};

export const BLOCK_EXPLORERS = {
  TESTNET: import.meta.env.VITE_SEPOLIA_BLOCK_EXPLORER || "https://sepolia.etherscan.io",
  MAINNET: import.meta.env.VITE_ETHEREUM_BLOCK_EXPLORER || "https://etherscan.io",
  WDK: import.meta.env.VITE_WDK_BLOCK_EXPLORER || "https://scan.wdk.io",
};

export const NETWORK_CONFIGS = {
  [NETWORK_MODE.TESTNET]: {
    label: "Sepolia",
    chainId: 11155111n,
    chainIdNum: 11155111,
    rpcUrl:
      import.meta.env.VITE_SEPOLIA_RPC_URL ||
      "https://sepolia.infura.io/v3/",
    blockExplorer: BLOCK_EXPLORERS.TESTNET,
    nativeCurrency: { name: "SepoliaETH", symbol: "SepoliaETH", decimals: 18 },
    vUSDTAddress: import.meta.env.VITE_TESTNET_USDT_ADDRESS || "0x5e68daa5deCdAB5a6bC97d2DB0E95adaD22E33e3",
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
    label: "Ethereum Mainnet",
    chainId: 1n,
    chainIdNum: 1,
    rpcUrl:
      import.meta.env.VITE_ETHEREUM_RPC_URL ||
      "https://mainnet.infura.io/v3/",
    blockExplorer: BLOCK_EXPLORERS.MAINNET,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    vUSDTAddress: import.meta.env.VITE_ETHEREUM_VUSDT_ADDRESS || "0xfD5840cd36d94D7B241fa0e21099d78e8638d98d",
    contracts: {
      vaultAddress:
        import.meta.env.VITE_ETHEREUM_VAULT_ADDRESS ||
        V2_MAINNET_PRESET.vaultAddress,
      engineAddress:
        import.meta.env.VITE_ETHEREUM_ENGINE_ADDRESS ||
        V2_MAINNET_PRESET.engineAddress,
      tokenAddress:
        import.meta.env.VITE_ETHEREUM_TOKEN_ADDRESS ||
        V2_MAINNET_PRESET.tokenAddress,
      circuitBreakerAddress:
        import.meta.env.VITE_ETHEREUM_CIRCUIT_BREAKER_ADDRESS ||
        V2_MAINNET_PRESET.circuitBreakerAddress,
      sharpeTrackerAddress:
        import.meta.env.VITE_ETHEREUM_SHARPE_TRACKER_ADDRESS ||
        V2_MAINNET_PRESET.sharpeTrackerAddress,
      pegArbExecutorAddress:
        import.meta.env.VITE_ETHEREUM_PEG_ARB_EXECUTOR_ADDRESS ||
        V2_MAINNET_PRESET.pegArbExecutorAddress,
      riskPolicyAddress:
        import.meta.env.VITE_ETHEREUM_POLICY_ADDRESS ||
        V2_MAINNET_PRESET.riskPolicyAddress,
      wdkAdapterAddress:
        import.meta.env.VITE_ETHEREUM_WDK_ADAPTER_ADDRESS ||
        V2_MAINNET_PRESET.wdkAdapterAddress,
      secondaryAdapterAddress:
        import.meta.env.VITE_ETHEREUM_SECONDARY_ADAPTER_ADDRESS ||
        V2_MAINNET_PRESET.secondaryAdapterAddress,
      executionAuctionAddress:
        import.meta.env.VITE_ETHEREUM_EXECUTION_AUCTION_ADDRESS ||
        V2_MAINNET_PRESET.executionAuctionAddress,
    },
  },
};

export const DEFAULT_NETWORK_MODE = NETWORK_MODE.TESTNET;

export const STORAGE_KEY = "wdkvault_network_mode";
