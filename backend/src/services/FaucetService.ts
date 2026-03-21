import { parseEther, formatEther, ethers } from 'ethers';
import { logger } from '@/utils/logger';

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

const USDT_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)'
];

export class FaucetService {
  private claims: Map<string, FaucetClaim> = new Map();
  private ipLimits: Map<string, RateLimitEntry> = new Map();
  private wallet: ethers.Wallet | null = null;
  private provider: ethers.JsonRpcProvider | null = null;

  private getWallet(): ethers.Wallet {
    if (!this.wallet) {
      const rpcUrl = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com';
      const privateKey = process.env.PRIVATE_KEY || process.env.ROBOT_FLEET_PRIVATE_KEY || '';
      if (!privateKey) throw new Error('No private key configured for faucet');
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.wallet = new ethers.Wallet(privateKey, this.provider);
    }
    return this.wallet;
  }

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
    const wallet = this.getWallet();
    const usdt = new ethers.Contract(TEST_USDT_CONTRACT, USDT_ABI, wallet);
    
    const masterBalance = await usdt.balanceOf(wallet.address);
    if (masterBalance < TEST_USDT_10K) {
      logger.warn({ balance: ethers.formatUnits(masterBalance, 6) }, '[Faucet] Insufficient USDT in master wallet');
      throw new Error('Faucet depleted. Try again later.');
    }
    
    logger.info({ to, amount: '10000' }, '[Faucet] Transferring USDT');
    const tx = await usdt.transfer(to, TEST_USDT_10K);
    await tx.wait();
    logger.info({ to, txHash: tx.hash }, '[Faucet] USDT transferred');
  }

  private async sendGasETH(to: string): Promise<void> {
    const wallet = this.getWallet();
    const provider = this.provider!;
    
    const balance = await provider.getBalance(wallet.address);
    if (balance < TEST_ETH_GAS) {
      logger.warn({ balance: ethers.formatEther(balance) }, '[Faucet] Insufficient ETH for gas');
      return;
    }
    
    logger.info({ to, amount: '0.005' }, '[Faucet] Sending ETH gas');
    const tx = await wallet.sendTransaction({ to, value: TEST_ETH_GAS });
    await tx.wait();
    logger.info({ to, txHash: tx.hash }, '[Faucet] ETH gas sent');
  }

  private async getUSDTBalance(addr: string): Promise<bigint> {
    const wallet = this.getWallet();
    const usdt = new ethers.Contract(TEST_USDT_CONTRACT, USDT_ABI, wallet);
    return usdt.balanceOf(addr);
  }
}
