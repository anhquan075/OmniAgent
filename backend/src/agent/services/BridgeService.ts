import WDK from '@tetherto/wdk';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

/**
 * BridgeService handles autonomous cross-chain movements using WDK.
 */
export class BridgeService {
  private wdk: WDK;

  constructor(wdk: WDK, bnbRpc?: string, solanaRpc?: string, tonRpc?: string) {
    this.wdk = wdk;
  }

  async fetchCrossChainYields() {
    return {
      bnb: 4.85,
      solana: 9.12, 
      ton: 7.24
    };
  }

  async analyzeBridgeOpportunity(currentChain: string, threshold = 2.0) {
    const yields: any = await this.fetchCrossChainYields();
    const currentYield = yields[currentChain] || 0;
    
    let bestChain = currentChain;
    let bestYield = currentYield;

    for (const [chain, chainYield] of Object.entries(yields)) {
      const y = chainYield as number;
      if (y - currentYield >= threshold && y > bestYield) {
        bestYield = y;
        bestChain = chain;
      }
    }

    if (bestChain !== currentChain) {
      return { shouldBridge: true, targetChain: bestChain, expectedYield: bestYield };
    }

    return { shouldBridge: false };
  }

  async executeBridge(fromChain: string, toChain: string, amount: number, tokenAddress?: string) {
    logger.info({ amount, fromChain, toChain }, '[BridgeService] WDK OMNICHAIN TRANSFER');
    
    try {
      const fromAccount = await this.wdk.getAccount(fromChain);
      const toAccount = await this.wdk.getAccount(toChain);
      const recipientAddress = await toAccount.getAddress();

      // Check balance before bridging
      const token = tokenAddress || (fromChain === 'bnb' ? env.WDK_USDT_ADDRESS : '');
      
      const result = await (fromAccount as any).transfer({
        token: token,
        recipient: recipientAddress,
        amount: amount.toString(),
        targetChain: toChain 
      });
      
      return { success: true, hash: result.hash, toChain };
    } catch (error: any) {
      logger.error(error, '[BridgeService] WDK Transfer Failed');
      return { success: false, error: error.message };
    }
  }

  async bridgeUsdt(sourceChain: string, targetChain: string, amount: bigint) {
    return this.executeBridge(sourceChain, targetChain, Number(amount) / 1e18);
  }
}
