import { ethers } from 'ethers';
import { env } from '@/config/env';

const KYC_SBT_ADDRESS = env.HASHKEY_KYC_SBT_ADDRESS || '0x1525E262Cb5bDFC7b51802c36a1141bA94405F76';

export class HashKeyKycService {
  private provider: ethers.JsonRpcProvider;
  private abi = [
    'function getKycInfo(address) view returns (tuple(uint8 level, uint256 timestamp, bool isValid))'
  ];

  constructor() {
    this.provider = new ethers.JsonRpcProvider(
      env.HASHKEY_RPC_URL || 'https://testnet.hashkeychain.com/rpc'
    );
  }

  async getKycLevel(address: string): Promise<number> {
    try {
      const contract = new ethers.Contract(KYC_SBT_ADDRESS, this.abi, this.provider);
      const info = await contract.getKycInfo(address);
      return Number(info.level);
    } catch (error) {
      return 0;
    }
  }

  getMaxExposure(level: number): bigint {
    const map: Record<number, bigint> = {
      0: ethers.parseEther('10'),
      1: ethers.parseEther('100'),
      2: ethers.parseEther('1000'),
      3: ethers.parseEther('10000')
    };
    return map[level] || ethers.parseEther('10');
  }

  getYieldMultiplier(level: number): number {
    const multipliers = [1, 1.2, 1.5, 2.0];
    return multipliers[level] || 1.0;
  }
}

export const kycService = new HashKeyKycService();