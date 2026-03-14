import { ethers, Contract } from 'ethers';
import { env } from '@/config/env';

// Load ABIs
import strategyEngineAbi from '../abis/StrategyEngine.json';
import zkOracleAbi from '../abis/ZKRiskOracle.json';
import breakerAbi from '../abis/CircuitBreaker.json';
import wdkVaultAbi from '../abis/WDKVault.json';

console.log(`[Ethers] Initializing provider with: ${env.BNB_RPC_URL}`);
const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);

export const getContracts = () => {
  // StrategyEngine and CircuitBreaker are full artifacts, WDKVault and ZKRiskOracle are direct ABI arrays
  const engineAbi = (strategyEngineAbi as any).abi || strategyEngineAbi;
  const breakerAbiActual = (breakerAbi as any).abi || breakerAbi;
  const vaultAbi = (wdkVaultAbi as any).abi || wdkVaultAbi;
  const oracleAbi = (zkOracleAbi as any).abi || zkOracleAbi;

  return {
    vault: new Contract(env.WDK_VAULT_ADDRESS, vaultAbi, provider),
    zkOracle: new Contract(env.WDK_ZK_ORACLE_ADDRESS, oracleAbi, provider),
    breaker: new Contract(env.WDK_BREAKER_ADDRESS, breakerAbiActual, provider),
    engine: new Contract(env.WDK_ENGINE_ADDRESS, engineAbi, provider),
    usdt: new Contract(env.WDK_USDT_ADDRESS, ['function balanceOf(address) view returns (uint256)'], provider),
    provider
  };
};
