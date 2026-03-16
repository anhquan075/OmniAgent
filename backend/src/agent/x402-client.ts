import WDK from '@tetherto/wdk';

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

  async payAndFetch(serviceUrl: string, providerAddress: string, amount: string) {
    console.log(`[X402Client] Requesting gated service: ${serviceUrl}`);
    console.log(`[X402Client] Paying ${amount} USD₮ to ${providerAddress}...`);

    const bnbAccount = await this.wdk.getAccount('bnb');
    
    // Execute Transfer
    const result = await (bnbAccount as any).transfer({
      token: this.usdtAddress,
      recipient: providerAddress,
      amount: amount
    });

    console.log(`[X402Client] Payment Sent! Proof (Hash): ${result.hash}`);

    // Call Gated API with Proof
    const response = await fetch(serviceUrl, {
      method: 'GET',
      headers: {
        'Authorization': `x402 ${result.hash}`,
        'X-402-Payment-Hash': result.hash
      }
    });

    if (response.status === 402) {
      throw new Error("Payment Required (x402 error)");
    }

    return await response.json();
  }
}
