import WDK from '@tetherto/wdk';
import { WdkExecutor } from './middleware/WdkExecutor';
import { getPolicyGuard } from './middleware/PolicyGuard';
import { getContracts } from '@/contracts/clients/ethers';
import { env } from '@/config/env';

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
    console.log(`[X402Client] Requesting gated service: ${serviceUrl}`);
    console.log(`[X402Client] Paying ${amount} USD₮ to ${providerAddress}...`);

    const wdkExecutor = new WdkExecutor(this.wdk);
    const { usdt } = getContracts();
    
    // Execute Transfer using WdkExecutor (which enforces PolicyGuard)
    const tx = await wdkExecutor.sendTransaction('bnb', {
      to: this.usdtAddress,
      data: usdt.interface.encodeFunctionData("transfer", [providerAddress, amount])
    }, { riskLevel: currentRiskLevel, portfolioValue: portfolioValue, estimatedAmount: amount });

    console.log(`[X402Client] Payment Sent! Proof (Hash): ${tx.hash}`);

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
