import { ethers } from 'ethers';
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

const USDT_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)'
];

const VAULT_ABI = [
  'function deposit(uint256 assets, address receiver) external returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver) external returns (uint256 assets)',
  'function maxDeposit(address) external view returns (uint256)',
  'function previewRedeem(uint256 shares) external view returns (uint256)'
];

export interface RobotAgentConfig {
  id: string;
  type: string;
  seedPhrase: string;
  derivationPath: string;
  rpcUrl: string;
}

export class RobotAgent {
  public readonly id: string;
  public readonly type: string;
  public readonly derivationPath: string;
  
  private walletManager: any;
  private account: any;
  private x402Fetch: typeof fetch;
  private address: string;
  private shares: bigint = 0n;

  constructor(config: RobotAgentConfig) {
    this.id = config.id;
    this.type = config.type;
    this.derivationPath = config.derivationPath;
    this.address = '';
  }

  async initialize(): Promise<void> {
    try {
      const { default: WalletManagerEvm } = await import('@tetherto/wdk-wallet-evm');
      
      this.walletManager = new WalletManagerEvm(
        env.WDK_SECRET_SEED,
        { provider: env.SEPOLIA_RPC_URL }
      );
      
      this.account = await this.walletManager.getAccount(this.derivationPath);
      this.address = await this.account.getAddress();
      
      const client = new x402Client();
      registerExactEvmScheme(client, { signer: this.account });
      this.x402Fetch = wrapFetchWithPayment(fetch, client);
      
      logger.info({ 
        id: this.id, 
        type: this.type, 
        address: this.address,
        path: this.derivationPath 
      }, '[RobotAgent] Initialized');
    } catch (error) {
      logger.error({ error, id: this.id }, '[RobotAgent] Failed to initialize');
      throw error;
    }
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  async getBalance(): Promise<{ eth: string; usdt: string }> {
    try {
      const ethBalance = await this.account.getBalance();
      const usdtBalance = await this.account.getTokenBalance(env.WDK_USDT_ADDRESS);
      
      return {
        eth: ethBalance.toString(),
        usdt: usdtBalance.toString()
      };
    } catch (error) {
      logger.error({ error, id: this.id }, '[RobotAgent] Failed to get balance');
      return { eth: '0', usdt: '0' };
    }
  }

  async depositToVault(amountUsdt: string): Promise<{ success: boolean; txHash?: string; shares?: string; error?: string }> {
    try {
      const vaultAddress = env.WDK_VAULT_ADDRESS;
      const usdtAddress = env.WDK_USDT_ADDRESS;
      
      if (!vaultAddress || !usdtAddress) {
        return { success: false, error: 'Vault or USDT address not configured' };
      }
      
      const usdtAmount = ethers.parseUnits(amountUsdt, 6);
      const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
      const signer = this.account;
      
      const encodeApprove = (spender: string, amount: bigint) => {
        const iface = new ethers.Interface(['function approve(address spender, uint256 amount)']);
        return iface.encodeFunctionData('approve', [spender, amount]);
      };
      
      const encodeDeposit = (assets: bigint, receiver: string) => {
        const iface = new ethers.Interface(['function deposit(uint256 assets, address receiver) returns (uint256 shares)']);
        return iface.encodeFunctionData('deposit', [assets, receiver]);
      };
      
      const approveData = encodeApprove(vaultAddress, ethers.MaxUint256);
      const depositData = encodeDeposit(usdtAmount, this.address);
      
      logger.info({ id: this.id, amount: amountUsdt }, '[RobotAgent] Approving USDT');
      const approveResult = await signer.sendTransaction({
        to: usdtAddress,
        value: 0n,
        data: approveData
      });
      await provider.getTransactionReceipt(approveResult.hash);
      
      logger.info({ id: this.id, amount: amountUsdt }, '[RobotAgent] Depositing to vault');
      const depositResult = await signer.sendTransaction({
        to: vaultAddress,
        value: 0n,
        data: depositData
      });
      const receipt = await provider.getTransactionReceipt(depositResult.hash);
      
      logger.info({ 
        id: this.id, 
        txHash: receipt.hash, 
      }, '[RobotAgent] Deposited to vault');
      
      return { success: true, txHash: receipt.hash, shares: '0' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, id: this.id }, '[RobotAgent] Vault deposit failed');
      return { success: false, error: message };
    }
  }

  async payForResource(url: string, options: RequestInit = {}): Promise<Response> {
    return this.x402Fetch(url, options);
  }

  async executeTask(taskData: Record<string, unknown>): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
  }> {
    try {
      logger.info({ id: this.id, type: this.type, task: taskData }, '[RobotAgent] Executing task');
      
      const depositAmount = (0.001 + Math.random() * 0.004).toFixed(3);
      const vaultResult = await this.depositToVault(depositAmount);
      
      return {
        success: true,
        result: {
          taskId: `${this.id}-${Date.now()}`,
          executedBy: this.id,
          type: this.type,
          timestamp: new Date().toISOString(),
          data: taskData,
          vaultDeposit: vaultResult.success ? {
            amount: depositAmount,
            txHash: vaultResult.txHash,
            shares: vaultResult.shares
          } : { error: vaultResult.error },
          totalShares: this.shares.toString()
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, id: this.id }, '[RobotAgent] Task execution failed');
      return { success: false, error: message };
    }
  }

  dispose(): void {
    if (this.account?.dispose) {
      this.account.dispose();
    }
    logger.debug({ id: this.id }, '[RobotAgent] Disposed');
  }
}

export async function createRobotAgent(
  id: string,
  type: string,
  robotIndex: number
): Promise<RobotAgent> {
  const agent = new RobotAgent({
    id,
    type,
    seedPhrase: env.WDK_SECRET_SEED,
    derivationPath: `0'/${robotIndex}/0`,
    rpcUrl: env.SEPOLIA_RPC_URL
  });
  
  await agent.initialize();
  return agent;
}
