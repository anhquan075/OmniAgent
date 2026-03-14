import { ethers, Contract } from 'ethers';
import { env } from '@/config/env';

// Load ABIs
import strategyEngineAbi from '../abis/StrategyEngine.json';
import zkOracleAbi from '../abis/ZKRiskOracle.json';
import breakerAbi from '../abis/CircuitBreaker.json';
import proofVaultAbi from '../abis/ProofVault.json';

const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);

export const getContracts = () => {
  return {
    vault: new Contract(env.WDK_VAULT_ADDRESS, proofVaultAbi, provider),
    zkOracle: new Contract(env.WDK_ZK_ORACLE_ADDRESS, zkOracleAbi, provider),
    breaker: new Contract(env.WDK_BREAKER_ADDRESS, breakerAbi, provider),
    engine: new Contract(env.WDK_ENGINE_ADDRESS, strategyEngineAbi, provider),
    usdt: new Contract(env.WDK_USDT_ADDRESS, ['function balanceOf(address) view returns (uint256)'], provider),
    provider
  };
};
