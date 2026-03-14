import WDK from '@tetherto/wdk';
import { env } from '@/config/env';

/**
 * BridgeService handles autonomous cross-chain movements using WDK.
 */
export class BridgeService {
  private wdk: WDK;

  constructor(wdk: WDK) {
    this.wdk = wdk;
  }

  async bridgeUsdt(sourceChain: string, targetChain: string, amount: bigint) {
    const sourceAccount = await this.wdk.getAccount(sourceChain);
    const targetAccount = await this.wdk.getAccount(targetChain);
    
    const recipient = await targetAccount.getAddress();
    const token = sourceChain === 'bnb' ? env.WDK_USDT_ADDRESS : 'mock-usdt-address';

    console.log(`Initiating bridge: ${amount.toString()} USD₮ from ${sourceChain} to ${targetChain}`);
    
    try {
      // In a real scenario, use @tetherto/wdk-protocol-bridge-usdt
      const bridgeProto = (sourceAccount as any).getBridgeProtocol('tether-bridge');
      const result = await bridgeProto.bridge({
        targetChain,
        recipient,
        token,
        amount
      });
      
      console.log(`Bridge transaction sent! Hash: ${result.hash}`);
      return result;
    } catch (error) {
      console.error('Bridge operation failed:', error);
      throw error;
    }
  }
}
