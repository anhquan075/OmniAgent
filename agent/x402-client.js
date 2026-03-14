/**
 * X402Client handles machine-to-machine payments for infrastructure.
 * Standard: https://github.com/tether-to/x402
 */
export class X402Client {
  constructor(wdk, usdtAddress) {
    this.wdk = wdk;
    this.usdtAddress = usdtAddress;
  }

  /**
   * Pay for a service using x402 protocol logic.
   * 1. Send USD₮ to provider.
   * 2. Receive proof.
   * 3. Call gated API with proof.
   */
  async payAndFetch(serviceUrl, providerAddress, amount) {
    console.log(`[x402] Requesting gated service: ${serviceUrl}`);
    console.log(`[x402] Paying ${amount} USD₮ to ${providerAddress}...`);

    const bnbAccount = await this.wdk.getAccount('bnb');
    
    // 1. Execute Transfer
    const result = await bnbAccount.transfer({
      token: this.usdtAddress,
      recipient: providerAddress,
      amount: amount
    });

    console.log(`[x402] Payment Sent! Proof (Hash): ${result.hash}`);

    // 2. Call Gated API with Proof
    // In x402, we typically send the hash in a header
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
