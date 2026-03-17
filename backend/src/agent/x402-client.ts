import WDK from '@tetherto/wdk';
import { WdkExecutor } from './middleware/WdkExecutor';
import { getContracts } from '@/contracts/clients/ethers';
import { logger } from '@/utils/logger';

/**
 * X402Client handles machine-to-machine payments for infrastructure.
 */
export class X402Client {
  private wdk: WDK;
  private usdtAddress: string;

  constructor(wdk: WDK, usdtAddress: string) {
    this.wdk = wdk;
    this.usdtAddress = usdtAddress;
  }

  async payAndFetch(serviceUrl: string, providerAddress: string, amount: string, currentRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH', portfolioValue: string) {
    logger.info({ serviceUrl }, '[X402Client] Requesting gated service');
    logger.info({ amount, providerAddress }, '[X402Client] Paying USD₮ to provider...');

    const wdkExecutor = new WdkExecutor(this.wdk);
    const { usdt } = getContracts();
    
    // Execute Transfer using WdkExecutor (which enforces PolicyGuard)
    const tx = await wdkExecutor.sendTransaction('bnb', {
      to: this.usdtAddress,
      data: usdt.interface.encodeFunctionData("transfer", [providerAddress, amount])
    }, { riskLevel: currentRiskLevel, portfolioValue: portfolioValue, estimatedAmount: amount });

    logger.info({ hash: tx.hash }, '[X402Client] Payment Sent!');

    // Call Gated API with Proof
    const response = await fetch(serviceUrl, {
      method: 'GET',
      headers: {
        'Authorization': `x402 ${tx.hash}`,
        'X-402-Payment-Hash': tx.hash
      }
    });

    if (response.status === 402) {
      throw new Error("Payment Required (x402 error)");
    }

    return await response.json();
  }
}
