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

/** HashKey Chain testnet contract addresses */
export const HASHKEY_TESTNET_PRESET = {
  vaultAddress: import.meta.env.VITE_HASHKEY_VAULT_ADDRESS || '0x605b6b8C83d8b0EA8867BEda4099DE4F042F7318',
  kycSbtAddress: import.meta.env.VITE_HASHKEY_KYC_SBT_ADDRESS || '0x1525E262Cb5bDFC7b51802c36a1141bA94405F76',
  usdtAddress: import.meta.env.VITE_HASHKEY_USDT_ADDRESS || '0xA3eb6Cb28659ec53388FE5Ff3E64920e3C274038',
  policyGuardAddress: import.meta.env.VITE_HASHKEY_POLICY_GUARD_ADDRESS || '0x1E997a52FEd011C74d5a8579a74DEf1BaC035fcD',
  agentNfaAddress: import.meta.env.VITE_HASHKEY_AGENT_NFA_ADDRESS || '0xdFf5A296102818507313639E646C15cC53c5153A',
  zkRiskOracleAddress: import.meta.env.VITE_HASHKEY_ZK_RISK_ORACLE_ADDRESS || '0x4aB2C183dAa811F5a2a26C3A3E6dF1d34F157Ec7',
  zkIdentityGateAddress: import.meta.env.VITE_HASHKEY_ZK_GATE_ADDRESS || '0x82f3c7967Fe2A0ae8C9C3caCA79b8c5C1805843E',
};
