import { parseEther, formatEther } from 'ethers';

interface FaucetClaim {
  walletAddress: string;
  claimedAt: Date;
  tokens: { usdt: bigint; eth: bigint };
  ip: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const TEST_USDT_CONTRACT = '0xd077a400968890eacc75cdc901f0356c943e4fdb';
const TEST_USDT_10K = 10_000n * 10n**6n;
const TEST_ETH_GAS = parseEther('0.005');
const MAX_USDT_BEFORE_BLOCK = 1000n * 10n**6n;

const WALLET_CLAIM_COOLDOWN_24H = 24 * 60 * 60 * 1000;
const IP_MAX_CLAIMS_24H = 5;
const IP_CLAIM_COOLDOWN_5MIN = 5 * 60 * 1000;

export class FaucetService {
  private claims: Map<string, FaucetClaim> = new Map();
  private ipLimits: Map<string, RateLimitEntry> = new Map();

  async claim(walletAddress: string, ip: string): Promise<FaucetClaim> {
    const addr = walletAddress.toLowerCase();
    await this.checkWalletCooldown(addr);
    await this.checkIPCooldown(ip);
    await this.checkExistingUSDT(addr);

    await this.mintUSDT(addr);
    await this.sendGasETH(addr);

    const claim: FaucetClaim = {
      walletAddress: addr,
      claimedAt: new Date(),
      tokens: { usdt: TEST_USDT_10K, eth: TEST_ETH_GAS },
      ip
    };

    this.claims.set(addr, claim);
    this.recordIPClaim(ip);
    console.log(`[Faucet] ${addr} claimed from ${ip}`);
    return claim;
  }

  async isEligible(walletAddress: string, _ip: string): Promise<boolean> {
    const claim = this.claims.get(walletAddress.toLowerCase());
    if (!claim) return true;
    return (Date.now() - claim.claimedAt.getTime()) >= WALLET_CLAIM_COOLDOWN_24H;
  }

  async getLastClaim(walletAddress: string): Promise<FaucetClaim | null> {
    return this.claims.get(walletAddress.toLowerCase()) ?? null;
  }

  private async checkWalletCooldown(addr: string): Promise<void> {
    const claim = this.claims.get(addr);
    if (!claim) return;
    
    const elapsed = Date.now() - claim.claimedAt.getTime();
    if (elapsed < WALLET_CLAIM_COOLDOWN_24H) {
      const hoursLeft = Math.ceil((WALLET_CLAIM_COOLDOWN_24H - elapsed) / 3600000);
      throw new Error(`Rate limited. Try again in ${hoursLeft}h.`);
    }
  }

  private async checkIPCooldown(ip: string): Promise<void> {
    const entry = this.ipLimits.get(ip);
    if (!entry) return;
    
    if (Date.now() > entry.resetAt) {
      this.ipLimits.delete(ip);
      return;
    }
    
    if (entry.count >= IP_MAX_CLAIMS_24H) {
      throw new Error('IP limit exceeded. Max 5 claims/24h.');
    }
  }

  private async checkExistingUSDT(addr: string): Promise<void> {
    const balance = await this.getUSDTBalance(addr);
    if (balance >= MAX_USDT_BEFORE_BLOCK) {
      throw new Error(`Wallet has ${formatEther(balance)} USDT. Already funded.`);
    }
  }

  private recordIPClaim(ip: string): void {
    const entry = this.ipLimits.get(ip);
    if (!entry || Date.now() > entry.resetAt) {
      this.ipLimits.set(ip, { count: 1, resetAt: Date.now() + 86400000 });
    } else {
      entry.count++;
    }
  }

  private async mintUSDT(to: string): Promise<void> {
    console.log(`[Faucet] Minting 10k USDT to ${to}`);
    // TODO: Integrate with wdk_mint_test_token MCP tool
  }

  private async sendGasETH(to: string): Promise<void> {
    console.log(`[Faucet] Sending 0.005 ETH gas to ${to}`);
    // TODO: Send from backend wallet
  }

  private async getUSDTBalance(_addr: string): Promise<bigint> {
    // TODO: Query chain via ethers.Contract
    return 0n;
  }
}
