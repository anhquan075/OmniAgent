import { ethers } from "ethers";
import WDK from '@tetherto/wdk';
import { getPolicyGuard, PolicyViolation } from './PolicyGuard';

export class WdkExecutor {
  private wdk: WDK;

  constructor(wdk: WDK) {
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
      console.warn(`[WdkExecutor] 🚫 Transaction Blocked by PolicyGuard: ${violation.reason}`);
      throw new Error(`PolicyGuard Blocked Transaction: [${violation.severity}] ${violation.reason}`);
    }

    const account = await this.wdk.getAccount(chain);
    
    // Proceed with the real WDK transaction
    console.log(`[WdkExecutor] ✅ Transaction passed PolicyGuard. Sending...`);
    const tx = await (account as any).sendTransaction(txParams);

    // Record the successful transaction to update daily volume and limits
    policyGuard.recordTransaction(amount, toAddress);

    return tx;
  }
}
