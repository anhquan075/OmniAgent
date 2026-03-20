import { logger } from '@/utils/logger';

export enum AccessTier {
  ANONYMOUS = 'anonymous',
  AUTHENTICATED = 'authenticated',
  OPERATOR = 'operator'
}

export interface PaymentReceipt {
  txHash: string;
  amount: number;
  token: 'USDC' | 'USDT';
  timestamp: number;
  recipient: string;
  verified: boolean;
}

export interface TierConfig {
  tier: AccessTier;
  pricePerCall: bigint;
  dailyLimit: bigint;
  requiresSignature: boolean;
}

const TIER_CONFIGS: Record<AccessTier, TierConfig> = {
  [AccessTier.ANONYMOUS]: {
    tier: AccessTier.ANONYMOUS,
    pricePerCall: 0n,
    dailyLimit: 0n,
    requiresSignature: false
  },
  [AccessTier.AUTHENTICATED]: {
    tier: AccessTier.AUTHENTICATED,
    pricePerCall: 1_000_000n,
    dailyLimit: 100_000_000_000n,
    requiresSignature: true
  },
  [AccessTier.OPERATOR]: {
    tier: AccessTier.OPERATOR,
    pricePerCall: 0n,
    dailyLimit: 1_000_000_000_000n,
    requiresSignature: true
  }
};

export class PaymentGate {
  private provider: string;
  private registry: string;
  private tierPrices: Map<string, bigint> = new Map();

  constructor(provider: string, registry: string) {
    this.provider = provider;
    this.registry = registry;
  }

  async getAccessTier(walletAddress: string): Promise<AccessTier> {
    if (walletAddress === this.provider) {
      return AccessTier.OPERATOR;
    }
    return AccessTier.AUTHENTICATED;
  }

  async validatePayment(receipt: PaymentReceipt): Promise<{
    valid: boolean;
    reason?: string;
    tier: AccessTier;
  }> {
    if (!receipt.verified) {
      return { valid: false, reason: 'Receipt not verified', tier: AccessTier.ANONYMOUS };
    }

    const tier = await this.getAccessTier(receipt.recipient);
    const config = TIER_CONFIGS[tier];

    if (config.requiresSignature) {
      logger.info({ tier, receipt }, '[PaymentGate] Authenticated access validated');
    }

    return { valid: true, tier, reason: 'Payment verified' };
  }

  async checkTierLimit(wallet: string, tier: AccessTier, dailyUsed: bigint): Promise<{
    allowed: boolean;
    remaining: bigint;
  }> {
    const config = TIER_CONFIGS[tier];
    const remaining = config.dailyLimit - dailyUsed;
    
    if (remaining <= 0) {
      return { allowed: false, remaining: 0n };
    }

    return { allowed: true, remaining };
  }

  getTierPrice(tier: AccessTier): bigint {
    return TIER_CONFIGS[tier].pricePerCall;
  }

  async estimateCost(tier: AccessTier, calls: number): Promise<bigint> {
    const price = this.getTierPrice(tier);
    return price * BigInt(calls);
  }
}

let globalPaymentGate: PaymentGate | null = null;

export function getPaymentGate(provider?: string, registry?: string): PaymentGate {
  if (!globalPaymentGate) {
    globalPaymentGate = new PaymentGate(
      provider || '0x0000000000000000000000000000000000000000',
      registry || '0x0000000000000000000000000000000000000000'
    );
  }
  return globalPaymentGate;
}
