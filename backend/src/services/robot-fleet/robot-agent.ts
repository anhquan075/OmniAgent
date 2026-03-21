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
  privateKey: string;
  rpcUrl: string;
}

export class RobotAgent {
  public readonly id: string;
  public readonly type: string;
  
  private walletManager: any;
  private account: any;
  private x402Fetch: typeof fetch | undefined;
  private address: string;
  private privateKey: string;
  private shares: bigint = 0n;

  constructor(config: RobotAgentConfig) {
    this.id = config.id;
    this.type = config.type;
    this.privateKey = config.privateKey;
    this.address = '';
  }

  async initialize(): Promise<void> {
    try {
      const { default: WalletManagerEvm } = await import('@tetherto/wdk-wallet-evm');
      
      this.walletManager = new WalletManagerEvm(
        this.privateKey,
        { provider: env.SEPOLIA_RPC_URL }
      );
      
      this.account = await this.walletManager.getAccount("0'/0/0");
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
      const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
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
      if (!receipt) {
        return { success: false, error: 'No transaction receipt for Aave supply' };
      }
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
      const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
      const signer = this.account;
      const aaveIface = new ethers.Interface(AAVE_POOL_ABI);
      
      logger.info({ id: this.id, amount: amountUsdt }, '[RobotAgent] Withdrawing from Aave');
      const withdrawResult = await signer.sendTransaction({
        to: aavePool,
        value: 0n,
        data: aaveIface.encodeFunctionData('withdraw', [usdtAddress, usdtAmount, this.address])
      });
      const receipt = await provider.waitForTransaction(withdrawResult.hash);
      if (!receipt) {
        return { success: false, error: 'No transaction receipt for Aave withdraw' };
      }
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
      if (!receipt) {
        return { success: false, error: 'No transaction receipt for USDT transfer' };
      }
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

      const defiOperations = ['vault_deposit', 'aave_supply', 'aave_withdraw'];
      const shouldAttemptDefi = Math.random() < 0.3;

      if (shouldAttemptDefi) {
        const op = defiOperations[Math.floor(Math.random() * defiOperations.length)];
        const balance = await this.getBalance();
        const minEthForGas = ethers.parseEther('0.002');
        const minUsdtForOp = ethers.parseUnits('1', 6);

        const ethBalance = BigInt(balance.eth);
        const usdtBalance = BigInt(balance.usdt);

        if (ethBalance < minEthForGas) {
          logger.warn({ id: this.id, ethBalance: balance.eth }, '[RobotAgent] Insufficient ETH for DeFi, skipping');
          return this.createNoOpResult(taskData);
        }

        if (usdtBalance < minUsdtForOp) {
          logger.warn({ id: this.id, usdtBalance: balance.usdt }, '[RobotAgent] Insufficient USDT for DeFi, skipping');
          return this.createNoOpResult(taskData);
        }

        const defiAmount = (parseFloat(balance.usdt) * 0.1).toFixed(2);
        let defiResult: { success: boolean; txHash?: string; error?: string } = { success: false };

        try {
          switch (op) {
            case 'vault_deposit':
              defiResult = await this.depositToVaultWithSafety(defiAmount);
              break;
            case 'aave_supply':
              defiResult = await this.supplyToAaveWithSafety(defiAmount);
              break;
            case 'aave_withdraw':
              defiResult = await this.withdrawFromAaveWithSafety(defiAmount);
              break;
          }
        } catch (defiError) {
          const msg = defiError instanceof Error ? defiError.message : String(defiError);
          logger.warn({ id: this.id, operation: op, error: msg }, '[RobotAgent] DeFi operation threw, will retry next cycle');
          return this.createNoOpResult(taskData);
        }

        if (defiResult.success) {
          logger.info({ id: this.id, operation: op, txHash: defiResult.txHash }, '[RobotAgent] DeFi operation succeeded');
        } else {
          logger.warn({ id: this.id, operation: op, error: defiResult.error }, '[RobotAgent] DeFi operation failed, will retry next cycle');
        }
      }

      return this.createNoOpResult(taskData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, id: this.id }, '[RobotAgent] Task execution failed');
      return { success: false, error: message };
    }
  }

  private createNoOpResult(taskData: Record<string, unknown>) {
    return {
      success: true,
      result: {
        taskId: `${this.id}-${Date.now()}`,
        executedBy: this.id,
        type: this.type,
        operation: 'NoOp',
        timestamp: new Date().toISOString(),
        data: taskData,
        defiResult: { success: true },
        address: this.address
      }
    };
  }

  private async depositToVaultWithSafety(amountUsdt: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
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
      try {
        await provider.estimateGas({ to: usdtAddress, data: approveData, from: this.address });
      } catch {
        return { success: false, error: 'USDT approve would fail (maybe not enough balance?)' };
      }

      const depositData = vaultIface.encodeFunctionData('deposit', [usdtAmount, this.address]);
      try {
        await provider.estimateGas({ to: vaultAddress, data: depositData, from: this.address });
      } catch {
        return { success: false, error: 'Vault deposit would fail (maybe vault paused?)' };
      }

      const approveResult = await signer.sendTransaction({ to: usdtAddress, value: 0n, data: approveData });
      await provider.waitForTransaction(approveResult.hash);

      const depositResult = await signer.sendTransaction({ to: vaultAddress, value: 0n, data: depositData });
      const receipt = await provider.waitForTransaction(depositResult.hash);
      if (!receipt) {
        return { success: false, error: 'No transaction receipt for vault deposit' };
      }

      return { success: true, txHash: receipt.hash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  private async supplyToAaveWithSafety(amountUsdt: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const aavePool = (env as any).AAVE_V3_POOL_SEPOLIA || '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951';
      const usdtAddress = env.WDK_USDT_ADDRESS;
      if (!usdtAddress) {
        return { success: false, error: 'USDT address not configured' };
      }

      const usdtAmount = ethers.parseUnits(amountUsdt, 6);
      const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
      const signer = this.account;
      const iface = new ethers.Interface(USDT_ABI);
      const aaveIface = new ethers.Interface(AAVE_POOL_ABI);

      const approveData = iface.encodeFunctionData('approve', [aavePool, ethers.MaxUint256]);
      try {
        await provider.estimateGas({ to: usdtAddress, data: approveData, from: this.address });
      } catch {
        return { success: false, error: 'USDT approve would fail' };
      }

      const supplyData = aaveIface.encodeFunctionData('supply', [usdtAddress, usdtAmount, this.address, 0]);
      try {
        await provider.estimateGas({ to: aavePool, data: supplyData, from: this.address });
      } catch {
        return { success: false, error: 'Aave supply would fail (maybe no liquidity?)' };
      }

      const approveResult = await signer.sendTransaction({ to: usdtAddress, value: 0n, data: approveData });
      await provider.waitForTransaction(approveResult.hash);

      const supplyResult = await signer.sendTransaction({ to: aavePool, value: 0n, data: supplyData });
      const receipt = await provider.waitForTransaction(supplyResult.hash);
      if (!receipt) {
        return { success: false, error: 'No transaction receipt for Aave supply' };
      }

      return { success: true, txHash: receipt.hash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  private async withdrawFromAaveWithSafety(amountUsdt: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const aavePool = (env as any).AAVE_V3_POOL_SEPOLIA || '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951';
      const usdtAddress = env.WDK_USDT_ADDRESS;
      if (!usdtAddress) {
        return { success: false, error: 'USDT address not configured' };
      }

      const usdtAmount = ethers.parseUnits(amountUsdt, 6);
      const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
      const signer = this.account;
      const aaveIface = new ethers.Interface(AAVE_POOL_ABI);

      const withdrawData = aaveIface.encodeFunctionData('withdraw', [usdtAddress, usdtAmount, this.address]);
      try {
        await provider.estimateGas({ to: aavePool, data: withdrawData, from: this.address });
      } catch {
        return { success: false, error: 'Aave withdraw would fail (no position or amount?)' };
      }

      const withdrawResult = await signer.sendTransaction({ to: aavePool, value: 0n, data: withdrawData });
      const receipt = await provider.waitForTransaction(withdrawResult.hash);
      if (!receipt) {
        return { success: false, error: 'No transaction receipt for Aave withdraw' };
      }

      return { success: true, txHash: receipt.hash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
  // Derive unique private key from master seed using HD derivation
  const masterWallet = ethers.HDNodeWallet.fromPhrase(env.WDK_SECRET_SEED);
  const derivedWallet = masterWallet.derivePath(`m/44'/60'/0'/0/${robotIndex}`);
  
  const agent = new RobotAgent({
    id,
    type,
    privateKey: derivedWallet.privateKey,
    rpcUrl: env.SEPOLIA_RPC_URL
  });
  
  await agent.initialize();
  return agent;
}
