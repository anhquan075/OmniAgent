export const V2_MAINNET_PRESET = {
  vaultAddress: import.meta.env.VITE_MAINNET_VAULT_ADDRESS,
  engineAddress: import.meta.env.VITE_MAINNET_ENGINE_ADDRESS,
  tokenAddress: import.meta.env.VITE_MAINNET_TOKEN_ADDRESS,
  circuitBreakerAddress: import.meta.env.VITE_MAINNET_CIRCUIT_BREAKER_ADDRESS,
  sharpeTrackerAddress: import.meta.env.VITE_MAINNET_SHARPE_TRACKER_ADDRESS,
  pegArbExecutorAddress: import.meta.env.VITE_MAINNET_PEG_ARB_EXECUTOR_ADDRESS,
  riskPolicyAddress: import.meta.env.VITE_MAINNET_POLICY_ADDRESS,
  wdkAdapterAddress: import.meta.env.VITE_MAINNET_WDK_ADAPTER_ADDRESS,
  secondaryAdapterAddress: import.meta.env.VITE_MAINNET_SECONDARY_ADAPTER_ADDRESS,
  lpAdapterAddress: import.meta.env.VITE_MAINNET_LP_ADAPTER_ADDRESS,
  executionAuctionAddress: import.meta.env.VITE_MAINNET_EXECUTION_AUCTION_ADDRESS,
};

export const V2_TESTNET_PRESET = {
  vaultAddress: import.meta.env.VITE_TESTNET_VAULT_ADDRESS,
  engineAddress: import.meta.env.VITE_TESTNET_ENGINE_ADDRESS,
  tokenAddress: import.meta.env.VITE_TESTNET_TOKEN_ADDRESS,
  circuitBreakerAddress: import.meta.env.VITE_TESTNET_CIRCUIT_BREAKER_ADDRESS,
  sharpeTrackerAddress: import.meta.env.VITE_TESTNET_SHARPE_TRACKER_ADDRESS,
  pegArbExecutorAddress: import.meta.env.VITE_TESTNET_PEG_ARB_EXECUTOR_ADDRESS,
  riskPolicyAddress: import.meta.env.VITE_TESTNET_POLICY_ADDRESS,
  wdkAdapterAddress: import.meta.env.VITE_TESTNET_WDK_ADAPTER_ADDRESS,
  secondaryAdapterAddress: import.meta.env.VITE_TESTNET_SECONDARY_ADAPTER_ADDRESS,
  executionAuctionAddress: import.meta.env.VITE_TESTNET_EXECUTION_AUCTION_ADDRESS,
};
