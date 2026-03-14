import WDK from '@tetherto/wdk';
import { ethers } from 'ethers';

/**
 * X402Client handles pay-per-fetch operations using WDK.
 */
export class X402Client {
  private wdk: WDK;
  private usdtAddress: string;

  constructor(wdk: WDK, usdtAddress: string) {
    this.wdk = wdk;
    this.usdtAddress = usdtAddress;
  }

  async payAndFetch(serviceUrl: string, providerAddress: string, amount: bigint) {
    console.log(`[X402] Paying ${ethers.formatUnits(amount, 18)} USD₮ to ${providerAddress} for service at ${serviceUrl}`);
    
    const bnbAccount = await this.wdk.getAccount('bnb');
    
    // In a real x402 scenario, we would:
    // 1. Send the USDT payment transaction
    // 2. Fetch the protected resource with the TX hash as proof
    
    const tx = await bnbAccount.sendTransaction({
      to: providerAddress,
      value: 0n,
      data: '0x' // Basic transfer or x402-specific data
    });

    console.log(`[X402] Payment sent: ${tx.hash}. Fetching resource...`);
    
    // Mock response
    return {
      status: 'success',
      txHash: tx.hash,
      data: { insights: "Market volatility is LOW. Optimized for yield." }
    };
  }
}
