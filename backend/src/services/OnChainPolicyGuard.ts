import { ethers } from 'ethers';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { getWdkSigner } from '@/lib/wdk-loader';

const POLICY_GUARD_ABI = [
  'function validate(address receiver, uint256 amountUsdt, uint256 portfolioValueUsdt) returns (bool)',
  'function commit(uint256 amountUsdt)',
  'function isEmergencyActive() view returns (bool)',
  'function getDailyStats() view returns (uint256 spent, uint256 remaining, uint256 limit, uint256 resetDay)',
  'function isWhitelisted(address receiver) view returns (bool)',
  'function isBlocked(address receiver) view returns (bool)',
  'function maxSingleTxUsdt() view returns (uint256)',
  'function dailyLimitUsdt() view returns (uint256)',
  'function maxPercentageBps() view returns (uint256)',
];

const AGENT_NFA_ABI = [
  'function execute(uint256 tokenId, tuple(address target, uint256 value, bytes data) action, uint256 portfolioValueUsdt) returns (bytes)',
  'function executeBatch(uint256 tokenId, tuple(address target, uint256 value, bytes data)[] actions, uint256 portfolioValueUsdt) returns (bytes[])',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function operatorOf(uint256 tokenId) view returns (address)',
  'function policyGuardOf(uint256 tokenId) view returns (address)',
];

export interface PolicyGuardValidation {
  approved: boolean;
  reason?: string;
  onChain: boolean;
  error?: boolean; // true if validation failed due to RPC/network error
}

export class OnChainPolicyGuard {
  private provider: ethers.JsonRpcProvider;
  private signerPromise: Promise<ethers.Signer> | null = null;
  private policyGuard: ethers.Contract | null = null;
  private agentNFA: ethers.Contract | null = null;
  private enabled: boolean = false;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);

    if (env.WDK_POLICY_GUARD_ADDRESS) {
      this.enabled = true;
      logger.info({ address: env.WDK_POLICY_GUARD_ADDRESS }, '[OnChainPolicyGuard] Initialized');
    }

    if (env.WDK_AGENT_NFA_ADDRESS) {
      logger.info({ address: env.WDK_AGENT_NFA_ADDRESS }, '[OnChainPolicyGuard] AgentNFA initialized');
    }
  }

  private async getSigner(): Promise<ethers.Signer> {
    if (!this.signerPromise) {
      this.signerPromise = (async () => {
        if (env.PRIVATE_KEY) {
          return new ethers.Wallet(env.PRIVATE_KEY, this.provider);
        }
        return getWdkSigner();
      })();
    }
    return this.signerPromise;
  }

  private async getPolicyGuardContract(): Promise<ethers.Contract> {
    if (!this.policyGuard) {
      const signer = await this.getSigner();
      if (env.WDK_POLICY_GUARD_ADDRESS) {
        this.policyGuard = new ethers.Contract(env.WDK_POLICY_GUARD_ADDRESS, POLICY_GUARD_ABI, signer);
      }
    }
    return this.policyGuard!;
  }

  private async getAgentNFAContract(): Promise<ethers.Contract> {
    if (!this.agentNFA) {
      const signer = await this.getSigner();
      if (env.WDK_AGENT_NFA_ADDRESS) {
        this.agentNFA = new ethers.Contract(env.WDK_AGENT_NFA_ADDRESS, AGENT_NFA_ABI, signer);
      }
    }
    return this.agentNFA!;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async validate(
    receiver: string,
    amountUsdt: bigint,
    portfolioValueUsdt: bigint = 0n
  ): Promise<PolicyGuardValidation> {
    if (!this.enabled) {
      return { approved: true, reason: 'On-chain PolicyGuard not configured', onChain: false };
    }

    try {
      const policyGuard = await this.getPolicyGuardContract();
      const isEmergency = await policyGuard.isEmergencyActive();
      if (isEmergency) {
        return { approved: false, reason: 'Emergency breaker is active', onChain: true };
      }

      const isBlocked = await policyGuard.isBlocked(receiver);
      if (isBlocked) {
        return { approved: false, reason: `Receiver ${receiver} is blocked`, onChain: true };
      }

      const isWhitelisted = await policyGuard.isWhitelisted(receiver);
      if (amountUsdt > 0n && !isWhitelisted) {
        return { approved: false, reason: `Receiver ${receiver} not whitelisted`, onChain: true };
      }

      const maxSingleTx = await policyGuard.maxSingleTxUsdt();
      if (amountUsdt > maxSingleTx) {
        return {
          approved: false,
          reason: `Amount ${amountUsdt} exceeds single tx limit ${maxSingleTx}`,
          onChain: true
        };
      }

      const maxPercentage = await policyGuard.maxPercentageBps();
      if (portfolioValueUsdt > 0n) {
        const tradeBps = (amountUsdt * 10000n) / portfolioValueUsdt;
        if (tradeBps > maxPercentage) {
          return {
            approved: false,
            reason: `Trade ${(Number(tradeBps) / 100).toFixed(2)}% exceeds max ${(Number(maxPercentage) / 100).toFixed(2)}%`,
            onChain: true
          };
        }
      }

      return { approved: true, onChain: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, '[OnChainPolicyGuard] Validation failed - FAIL-SECURE: rejecting for security');
      // FIX: Fail-secure - reject transaction when on-chain validation cannot be performed
      // This prevents bypassing policy checks due to RPC errors or network issues
      return {
        approved: false,
        reason: `On-chain policy check failed: ${message}. Transaction rejected for security.`,
        onChain: false,
        error: true
      };
    }
  }

  async commit(amountUsdt: bigint): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const policyGuard = await this.getPolicyGuardContract();
      const tx = await policyGuard.commit(amountUsdt);
      await tx.wait();
      logger.info({ txHash: tx.hash, amount: amountUsdt.toString() }, '[OnChainPolicyGuard] Committed');
      return tx.hash;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, '[OnChainPolicyGuard] Commit failed');
      return null;
    }
  }

  async executeThroughNFA(
    tokenId: number,
    target: string,
    value: bigint,
    data: string,
    portfolioValueUsdt: bigint = 0n
  ): Promise<{ success: boolean; txHash?: string; result?: string; error?: string }> {
    try {
      const agentNFA = await this.getAgentNFAContract();
      const action = { target, value, data };
      const tx = await agentNFA.execute(tokenId, action, portfolioValueUsdt);
      const receipt = await tx.wait();
      return { success: true, txHash: tx.hash };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  async getDailyStats(): Promise<{
    spent: bigint;
    remaining: bigint;
    limit: bigint;
    resetDay: bigint;
  } | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const policyGuard = await this.getPolicyGuardContract();
      return await policyGuard.getDailyStats();
    } catch {
      return null;
    }
  }
}

let globalOnChainPolicyGuard: OnChainPolicyGuard | null = null;

export function getOnChainPolicyGuard(): OnChainPolicyGuard {
  if (!globalOnChainPolicyGuard) {
    globalOnChainPolicyGuard = new OnChainPolicyGuard();
  }
  return globalOnChainPolicyGuard;
}
