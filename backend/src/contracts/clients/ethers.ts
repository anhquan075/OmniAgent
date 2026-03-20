import { ethers, Contract, Signer } from 'ethers';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { getWdkSigner } from '@/lib/wdk-loader';

// Load ABIs
import {
  StrategyEngineAbi,
  ZKRiskOracleAbi,
  CircuitBreakerAbi,
  OmniAgentVaultAbi,
  ExecutionAuctionAbi,
  GroupSyndicateAbi
} from '../abis';

logger.info({ rpcUrl: env.SEPOLIA_RPC_URL }, '[Ethers] Initializing provider');
export const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);

let signerPromise: Promise<Signer> | null = null;

export async function getSigner(): Promise<Signer> {
  if (!signerPromise) {
    signerPromise = (async () => {
      if (env.PRIVATE_KEY) {
        return new ethers.Wallet(env.PRIVATE_KEY, provider);
      }
      return getWdkSigner(env.SEPOLIA_RPC_URL);
    })();
  }
  return signerPromise;
}

export const getContracts = () => {
  const engineAbi = StrategyEngineAbi;
  const breakerAbiActual = CircuitBreakerAbi;
  const vaultAbiActual = OmniAgentVaultAbi;
  const oracleAbiActual = ZKRiskOracleAbi;
  const auctionAbiActual = ExecutionAuctionAbi;
  const syndicateAbiActual = GroupSyndicateAbi;

  const USDT_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function decimals() view returns (uint8)"
  ];
  return {
    vault: new Contract(env.WDK_VAULT_ADDRESS, vaultAbiActual, provider),
    zkOracle: new Contract(env.WDK_ZK_ORACLE_ADDRESS, oracleAbiActual, provider),
    breaker: new Contract(env.WDK_BREAKER_ADDRESS, breakerAbiActual, provider),
    engine: new Contract(env.WDK_ENGINE_ADDRESS, engineAbi, provider),
    auction: new Contract(env.WDK_AUCTION_ADDRESS || ethers.ZeroAddress, auctionAbiActual, provider),
    syndicate: new Contract(env.WDK_SYNDICATE_ADDRESS || ethers.ZeroAddress, syndicateAbiActual, provider),
    usdt: new Contract(env.WDK_USDT_ADDRESS, USDT_ABI, provider),
    provider
  };
};
