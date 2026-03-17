import { ethers } from 'ethers';
import { logger } from '../utils/logger';

export const LZ_ENDPOINT_BNB = '0x3c2269811836af69497E5F486A85D7316753cf62';

const LZ_RECEIVER_ABI = [
  "function bridge(uint32 dstEid, uint256 amount, bytes calldata options) external payable",
  "function quote(uint32 dstEid, uint256 amount, bytes calldata options) external view returns (uint256 nativeFee)",
  "function vault() external view returns (address)",
  "function asset() external view returns (address)"
];

export class LayerZeroBridgeClient {
  private bridgeContract: ethers.Contract;

  constructor(bridgeAddress: string, signer: ethers.Signer) {
    this.bridgeContract = new ethers.Contract(bridgeAddress, LZ_RECEIVER_ABI, signer);
  }

  async bridge(dstEid: number, amount: bigint, options: string, fee: bigint): Promise<ethers.ContractTransactionResponse> {
    logger.info({ dstEid, amount: amount.toString() }, '[LayerZeroBridgeClient] Initiating bridge');
    try {
      const tx = await this.bridgeContract.bridge(dstEid, amount, options, { value: fee });
      logger.info({ hash: tx.hash }, '[LayerZeroBridgeClient] Bridge transaction submitted');
      return tx;
    } catch (error) {
      logger.error({ error, dstEid, amount: amount.toString() }, '[LayerZeroBridgeClient] Bridge failed');
      throw error;
    }
  }

  async getQuote(dstEid: number, amount: bigint, options: string): Promise<bigint> {
    try {
      const nativeFee = await this.bridgeContract.quote(dstEid, amount, options);
      logger.debug({ nativeFee: nativeFee.toString() }, '[LayerZeroBridgeClient] Quote retrieved');
      return nativeFee;
    } catch (error) {
      logger.error({ error, dstEid }, '[LayerZeroBridgeClient] Failed to get quote');
      throw error;
    }
  }
}
