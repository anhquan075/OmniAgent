import { ethers } from 'ethers';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { 
  storeSessionKey, 
  getSessionKey, 
  getSessionKeyStatus,
  revokeSessionKey,
  decryptSessionKey,
  updateDailyLimit as updateStoreDailyLimit,
  checkRateLimit,
  StoredSessionKey
} from '@/lib/session-key-store';
import { encryptPrivateKey, generateSessionKey } from '@/lib/crypto-utils';
import { getErc4337Wallet, createErc4337Account, erc4337Config } from '@/protocols/erc4337-smart-account';

function getSimpleAccountFactory(): string {
  return process.env.SIMPLE_ACCOUNT_FACTORY_ADDRESS || '0x58Cc6439B281d46f40979f8E7A47B24C7f0F09f4';
}

export interface SessionKeyConfig {
  ownerAddress: string;
  sessionKeyAddress: string;
  dailyLimitUSD: number;
  allowedTargets: string[];
  expiresAt: Date;
}

export class SessionKeyManager {
  private provider: ethers.JsonRpcProvider;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
  }

  async createSmartAccount(ownerAddress: string): Promise<{ txHash: string }> {
    const { wallet, account, address } = await createErc4337Account();
    
    logger.info({ address, ownerAddress }, '[SessionKeyManager] Smart account ready via WDK');
    
    return { txHash: '' };
  }

  async getSmartAccountAddress(ownerAddress: string): Promise<string> {
    try {
      const iface = new ethers.Interface([
        'function getAddress(address owner) view returns (address)'
      ]);
      
      const callData = iface.encodeFunctionData('getAddress', [ownerAddress]);
      const result = await this.provider.call({
        to: getSimpleAccountFactory(),
        data: callData
      });
      
      const address = iface.decodeFunctionResult('getAddress', result)[0] as string;
      
      if (address === ethers.ZeroAddress) {
        return '';
      }
      
      return address;
    } catch (error) {
      logger.debug({ ownerAddress, error }, '[SessionKeyManager] Failed to get smart account address');
      return '';
    }
  }

  async isSmartAccountDeployed(ownerAddress: string): Promise<boolean> {
    const address = await this.getSmartAccountAddress(ownerAddress);
    if (!address) return false;
    
    const code = await this.provider.getCode(address);
    return code !== '0x';
  }

  async grantSessionKey(
    userSmartAccount: string,
    dailyLimitUSD: number,
    allowedTargets: string[],
    durationDays: number,
    userAddress: string
  ): Promise<{ txHash: string; sessionKeyAddress: string }> {
    if (!checkRateLimit(userAddress)) {
      throw new Error('Rate limit exceeded: Max 5 session keys per day');
    }
    
    const { address: sessionKeyAddress, privateKey } = generateSessionKey();
    
    const masterSecret = process.env.SESSION_KEY_MASTER_SECRET || 'dev-secret-session-key-2024';
    const encryptedPk = encryptPrivateKey(privateKey, masterSecret);
    
    await storeSessionKey(userAddress, {
      ownerAddress: userAddress,
      smartAccount: userSmartAccount,
      sessionKeyAddress,
      encryptedPrivateKey: encryptedPk,
      dailyLimitUSD,
      allowedTargets,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
      revoked: false
    });
    
    logger.info({ userAddress, sessionKeyAddress, dailyLimitUSD }, '[SessionKeyManager] Session key stored');
    
    return { txHash: '', sessionKeyAddress };
  }

  async revokeSessionKey(
    userSmartAccount: string,
    sessionKeyAddress: string,
    userAddress: string
  ): Promise<{ txHash: string }> {
    await revokeSessionKey(userAddress);
    
    logger.info({ userAddress, sessionKeyAddress }, '[SessionKeyManager] Session key revoked');
    
    return { txHash: '' };
  }

  async updateDailyLimit(
    userSmartAccount: string,
    sessionKeyAddress: string,
    newLimitUSD: number,
    userAddress: string
  ): Promise<{ txHash: string }> {
    await updateStoreDailyLimit(userAddress, newLimitUSD);
    
    logger.info({ userAddress, newLimitUSD }, '[SessionKeyManager] Daily limit updated');
    
    return { txHash: '' };
  }

  async isSessionKeyValid(
    userSmartAccount: string,
    sessionKeyAddress: string
  ): Promise<boolean> {
    const stored = await getSessionKey(sessionKeyAddress);
    if (!stored) return false;
    
    if (stored.revoked) return false;
    if (new Date() > stored.expiresAt) return false;
    
    return true;
  }

  async getSessionKeyInfo(
    userSmartAccount: string,
    sessionKeyAddress: string
  ): Promise<{
    dailyLimitUSD: number;
    expiresAt: number;
    isActive: boolean;
    dailySpentUSD: number;
    resetTime: number;
  }> {
    const stored = await getSessionKey(sessionKeyAddress);
    
    if (!stored) {
      return {
        dailyLimitUSD: 0,
        expiresAt: 0,
        isActive: false,
        dailySpentUSD: 0,
        resetTime: 0
      };
    }
    
    return {
      dailyLimitUSD: stored.dailyLimitUSD,
      expiresAt: stored.expiresAt.getTime() / 1000,
      isActive: !stored.revoked && stored.expiresAt > new Date(),
      dailySpentUSD: 0,
      resetTime: 0
    };
  }

  async getActiveSessionKeys(userAddress: string): Promise<SessionKeyConfig[]> {
    const stored = await getSessionKey(userAddress);
    
    if (!stored) return [];
    
    const isValid = await this.isSessionKeyValid(stored.smartAccount, stored.sessionKeyAddress);
    if (!isValid) return [];
    
    return [{
      ownerAddress: stored.ownerAddress,
      sessionKeyAddress: stored.sessionKeyAddress,
      dailyLimitUSD: stored.dailyLimitUSD,
      allowedTargets: stored.allowedTargets,
      expiresAt: stored.expiresAt
    }];
  }

  async getSignerForUser(userAddress: string): Promise<ethers.Wallet | null> {
    const decryptedPk = await decryptSessionKey(userAddress);
    if (!decryptedPk) return null;
    return new ethers.Wallet(decryptedPk, this.provider);
  }

  async executeWithSessionKey(
    userAddress: string,
    to: string,
    value: bigint,
    data: string
  ): Promise<{ hash: string }> {
    const stored = await getSessionKey(userAddress);
    if (!stored) {
      throw new Error('No session key found');
    }
    
    const isValid = await this.isSessionKeyValid(stored.smartAccount, stored.sessionKeyAddress);
    if (!isValid) {
      throw new Error('Session key expired or revoked');
    }
    
    if (stored.allowedTargets.length > 0) {
      const isAllowed = stored.allowedTargets.some(
        target => target.toLowerCase() === to.toLowerCase()
      );
      if (!isAllowed) {
        throw new Error('Target address not allowed');
      }
    }
    
    const wallet = await getErc4337Wallet();
    const tx = await wallet.execute(to, value, data);
    
    return { hash: tx.hash || '' };
  }
}

let instance: SessionKeyManager | null = null;

export function getSessionKeyManager(): SessionKeyManager {
  if (!instance) {
    instance = new SessionKeyManager();
  }
  return instance;
}
