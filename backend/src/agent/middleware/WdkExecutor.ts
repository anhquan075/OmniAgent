import { ethers } from "ethers";
import { getPolicyGuard } from './PolicyGuard';
import { getOnChainPolicyGuard } from '@/services/OnChainPolicyGuard';
import { checkNavImpact } from '@/services/NavShield';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

function chainToId(chain: string): number {
  switch (chain) {
    case 'sepolia': return 11155111;
    case 'ethereum': return 1;
    default: return 11155111;
  }
}

export class WdkExecutor {
  private wdk: any;

  constructor(wdk: any) {
    this.wdk = wdk;
  }

  async sendTransaction(chain: string, txParams: any, contextInfo: { 
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'; 
    portfolioValue: string; 
    estimatedAmount?: string;
  }) {
    const policyGuard = getPolicyGuard();
    const onChainPolicyGuard = getOnChainPolicyGuard();

    const amount = txParams.value ? txParams.value.toString() : (contextInfo.estimatedAmount || "0");
    const toAddress = txParams.to;

    const navResult = await checkNavImpact({
      vaultAddress: env.WDK_VAULT_ADDRESS,
      inputAmount: txParams.value ? BigInt(txParams.value.toString()) : 0n,
      expectedOutputAmount: 0n,
      inputTokenPriceUsdt: ethers.parseUnits('1', 18),
      outputTokenPriceUsdt: 0n,
      chainId: chainToId(chain),
    });
    if (!navResult.allowed) {
      logger.warn({ code: navResult.code, reason: navResult.reason }, '[WdkExecutor] Transaction Blocked by NAV Shield');
      throw new Error(`NAVShield Blocked: [${navResult.code}] ${navResult.reason}`);
    }

    const violation = policyGuard.validateTransaction({
      toAddress: toAddress,
      amount: amount,
      currentRiskLevel: contextInfo.riskLevel,
      portfolioValue: contextInfo.portfolioValue
    });

    if (violation.violated) {
      logger.warn({ severity: violation.severity, reason: violation.reason }, '[WdkExecutor] Transaction Blocked by PolicyGuard');
      throw new Error(`PolicyGuard Blocked Transaction: [${violation.severity}] ${violation.reason}`);
    }

    if (onChainPolicyGuard.isEnabled()) {
      const portfolioValueUsdt = contextInfo.portfolioValue 
        ? ethers.parseUnits(contextInfo.portfolioValue, 18)
        : 0n;
      const amountUsdt = ethers.parseUnits(amount || '0', 6);
      
      const onChainResult = await onChainPolicyGuard.validate(toAddress, amountUsdt, portfolioValueUsdt);
      
      if (!onChainResult.approved) {
        logger.warn({ 
          reason: onChainResult.reason,
          onChain: onChainResult.onChain,
          error: onChainResult.error
        }, '[WdkExecutor] Transaction Blocked by On-Chain PolicyGuard');
        throw new Error(`OnChainPolicyGuard Blocked: ${onChainResult.reason}`);
      }
      
      logger.info('[WdkExecutor] On-chain PolicyGuard validation passed');
    }

    const account = await this.wdk.getAccount(chain);
    
    logger.info('[WdkExecutor] Transaction passed all PolicyGuard checks. Sending...');
    const tx = await (account as any).sendTransaction(txParams);

    policyGuard.recordTransaction(amount, toAddress);

    if (onChainPolicyGuard.isEnabled()) {
      const amountUsdt = ethers.parseUnits(amount || '0', 6);
      await onChainPolicyGuard.commit(amountUsdt);
    }

    return tx;
  }
}
