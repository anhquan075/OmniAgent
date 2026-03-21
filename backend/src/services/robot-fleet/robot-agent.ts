import { ethers } from 'ethers';
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { ClientEvmSigner } from '@x402/evm';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

const USDT_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
];

const VAULT_ABI = [
  'function deposit(uint256 assets, address receiver) external returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver) external returns (uint256 assets)'
];

const AAVE_POOL_ABI = [
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
  'function withdraw(address asset, uint256 amount, address to) external returns (uint256)'
];

const SWAP_ABI = [
  'function swap(address fromToken, address toToken, uint256 amount, address to) external returns (uint256)'
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
  private x402Fetch: typeof fetch | undefined;
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
      
      const account = this.account;
      const signer: ClientEvmSigner = {
        address: account.address as `0x${string}`,
        async signTypedData(message) {
          return account.signTypedData(message as any) as Promise<`0x${string}`>;
        },
      };
      const client = new x402Client();
      registerExactEvmScheme(client, { signer });
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
      
      const iface = new ethers.Interface(USDT_ABI);
      const vaultIface = new ethers.Interface(VAULT_ABI);
      
      const approveData = iface.encodeFunctionData('approve', [vaultAddress, ethers.MaxUint256]);
      const depositData = vaultIface.encodeFunctionData('deposit', [usdtAmount, this.address]);
      
      logger.info({ id: this.id, amount: amountUsdt }, '[RobotAgent] Approving USDT for vault');
      const approveResult = await signer.sendTransaction({
        to: usdtAddress,
        value: 0n,
        data: approveData
      });
      await provider.waitForTransaction(approveResult.hash);
      
      logger.info({ id: this.id, amount: amountUsdt }, '[RobotAgent] Depositing to vault');
      const depositResult = await signer.sendTransaction({
        to: vaultAddress,
        value: 0n,
        data: depositData
      });
      const receipt = await provider.waitForTransaction(depositResult.hash);
      
      if (!receipt) {
        throw new Error('Failed to get transaction receipt');
      }
      
      logger.info({ id: this.id, txHash: receipt.hash }, '[RobotAgent] Deposited to vault');
      return { success: true, txHash: receipt.hash, shares: '0' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, id: this.id }, '[RobotAgent] Vault deposit failed');
      return { success: false, error: message };
    }
  }

  async supplyToAave(amountUsdt: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const aavePool = (env as any).AAVE_V3_POOL_SEPOLIA || '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951';
      const usdtAddress = env.WDK_USDT_ADDRESS;
      
      if (!usdtAddress) {
        return { success: false, error: 'USDT address not configured' };
      }
      
      const usdtAmount = ethers.parseUnits(amountUsdt, 6);
      const signer = this.account;
      const iface = new ethers.Interface(USDT_ABI);
      const aaveIface = new ethers.Interface(AAVE_POOL_ABI);
      
      const approveData = iface.encodeFunctionData('approve', [aavePool, ethers.MaxUint256]);
      const supplyData = aaveIface.encodeFunctionData('supply', [usdtAddress, usdtAmount, this.address, 0]);
      
      logger.info({ id: this.id, amount: amountUsdt }, '[RobotAgent] Approving USDT for Aave');
      const approveResult = await signer.sendTransaction({
        to: usdtAddress,
        value: 0n,
        data: approveData
      });
      await provider.waitForTransaction(approveResult.hash);
      
      logger.info({ id: this.id, amount: amountUsdt }, '[RobotAgent] Supplying to Aave');
      const supplyResult = await signer.sendTransaction({
        to: aavePool,
        value: 0n,
        data: supplyData
      });
      const receipt = await provider.waitForTransaction(supplyResult.hash);
      
      logger.info({ id: this.id, txHash: receipt.hash }, '[RobotAgent] Supplied to Aave');
      return { success: true, txHash: receipt.hash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, id: this.id }, '[RobotAgent] Aave supply failed');
      return { success: false, error: message };
    }
  }

  async withdrawFromAave(amountUsdt: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const aavePool = (env as any).AAVE_V3_POOL_SEPOLIA || '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951';
      const usdtAddress = env.WDK_USDT_ADDRESS;
      
      if (!usdtAddress) {
        return { success: false, error: 'USDT address not configured' };
      }
      
      const usdtAmount = ethers.parseUnits(amountUsdt, 6);
      const signer = this.account;
      const aaveIface = new ethers.Interface(AAVE_POOL_ABI);
      
      logger.info({ id: this.id, amount: amountUsdt }, '[RobotAgent] Withdrawing from Aave');
      const withdrawResult = await signer.sendTransaction({
        to: aavePool,
        value: 0n,
        data: aaveIface.encodeFunctionData('withdraw', [usdtAddress, usdtAmount, this.address])
      });
      const receipt = await provider.waitForTransaction(withdrawResult.hash);
      
      logger.info({ id: this.id, txHash: receipt.hash }, '[RobotAgent] Withdrew from Aave');
      return { success: true, txHash: receipt.hash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, id: this.id }, '[RobotAgent] Aave withdraw failed');
      return { success: false, error: message };
    }
  }

  async transferUsdt(toAddress: string, amountUsdt: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const usdtAddress = env.WDK_USDT_ADDRESS;
      
      if (!usdtAddress) {
        return { success: false, error: 'USDT address not configured' };
      }
      
      const usdtAmount = ethers.parseUnits(amountUsdt, 6);
      const signer = this.account;
      const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
      const iface = new ethers.Interface(USDT_ABI);
      
      logger.info({ id: this.id, amount: amountUsdt, to: toAddress }, '[RobotAgent] Transferring USDT');
      const txResult = await signer.sendTransaction({
        to: usdtAddress,
        value: 0n,
        data: iface.encodeFunctionData('transfer', [toAddress, usdtAmount])
      });
      const receipt = await provider.waitForTransaction(txResult.hash);
      
      logger.info({ id: this.id, txHash: receipt.hash }, '[RobotAgent] Transferred USDT');
      return { success: true, txHash: receipt.hash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, id: this.id }, '[RobotAgent] USDT transfer failed');
      return { success: false, error: message };
    }
  }

  async payForResource(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.x402Fetch) {
      throw new Error('RobotAgent not initialized');
    }
    return this.x402Fetch(url, options);
  }

  async executeTask(taskData: Record<string, unknown>): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
  }> {
    try {
      logger.info({ id: this.id, type: this.type, task: taskData }, '[RobotAgent] Executing task');
      
      const operations = [
        { name: 'Aave Supply', fn: () => this.supplyToAave('0.01') },
        { name: 'Aave Withdraw', fn: () => this.withdrawFromAave('0.005') },
        { name: 'Vault Deposit', fn: () => this.depositToVault('0.01') }
      ];
      
      const selectedOp = operations[Math.floor(Math.random() * operations.length)];
      logger.info({ id: this.id, operation: selectedOp.name }, '[RobotAgent] Starting DeFi operation');
      
      const result = await selectedOp.fn();
      
      return {
        success: result.success,
        result: {
          taskId: `${this.id}-${Date.now()}`,
          executedBy: this.id,
          type: this.type,
          operation: selectedOp.name,
          timestamp: new Date().toISOString(),
          data: taskData,
          defiResult: result,
          address: this.address
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
