"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.X402Client = void 0;
/**
 * X402Client handles machine-to-machine payments for infrastructure.
 */
class X402Client {
    wdk;
    usdtAddress;
    constructor(wdk, usdtAddress) {
        this.wdk = wdk;
        this.usdtAddress = usdtAddress;
    }
    async payAndFetch(serviceUrl, providerAddress, amount) {
        console.log(`[X402Client] Requesting gated service: ${serviceUrl}`);
        console.log(`[X402Client] Paying ${amount} USD₮ to ${providerAddress}...`);
        const bnbAccount = await this.wdk.getAccount('bnb');
        // Execute Transfer
        const result = await bnbAccount.transfer({
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
exports.X402Client = X402Client;
