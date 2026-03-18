import { ethers } from "ethers";
import { getPolicyGuard, PolicyViolation } from './PolicyGuard';
import { logger } from '@/utils/logger';

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

    const amount = txParams.value ? txParams.value.toString() : (contextInfo.estimatedAmount || "0");
    const toAddress = txParams.to;

    // 1. Strict recipient whitelisting & transaction validation
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

    const account = await this.wdk.getAccount(chain);
    
    // Proceed with the real WDK transaction
    logger.info('[WdkExecutor] Transaction passed PolicyGuard. Sending...');
    const tx = await (account as any).sendTransaction(txParams);

    // Record the successful transaction to update daily volume and limits
    policyGuard.recordTransaction(amount, toAddress);

    return tx;
  }
}
