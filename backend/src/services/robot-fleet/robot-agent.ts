import { ethers } from 'ethers';
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { ClientEvmSigner } from '@x402/evm';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { spawn } from 'child_process';
import * as path from 'path';

type Chain = 'sepolia' | 'hashkey';

export type { Chain };

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
  accountIndex: number;
  rpcUrl: string;
  chain?: Chain;
  privateKey?: string;
}

export class RobotAgent {
  public readonly id: string;
  public readonly type: string;
  public readonly accountIndex: number;
  public readonly chain: Chain;
  
  private walletManager: any;
  private account: any;
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Signer | null = null;
  private x402Fetch: typeof fetch | undefined;
  private address: string = '';
  private shares: bigint = 0n;

  constructor(config: RobotAgentConfig) {
    this.id = config.id;
    this.type = config.type;
    this.accountIndex = config.accountIndex;
    this.chain = config.chain ?? 'sepolia';
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  async initialize(): Promise<void> {
    try {
      if (this.chain === 'hashkey') {
        // HashKey chain: use direct private key signer (no WDK dependency)
        const pk = env.HASHKEY_DEPLOYER_PK || env.PRIVATE_KEY;
        if (!pk) {
          throw new Error('HASHKEY_DEPLOYER_PK or PRIVATE_KEY not set for HashKey robot');
        }
        this.signer = new ethers.Wallet(pk.replace(/^0x/, ''), this.provider);
        this.address = await this.signer.getAddress();
        
        logger.info({ 
          id: this.id, 
          type: this.type,
          address: this.address,
          chain: this.chain 
        }, '[RobotAgent] Initialized for HashKey');
        return;
      }

      // Sepolia: use WDK wallet manager
      const { default: WalletManagerEvm } = await import('@tetherto/wdk-wallet-evm');
      
      this.walletManager = new WalletManagerEvm(
        env.WDK_SECRET_SEED,
        { provider: env.SEPOLIA_RPC_URL }
      );
      
      this.account = await this.walletManager.getAccount(this.accountIndex);
      this.address = await this.account.getAddress();
      
      const account = this.account;
      const signer: ClientEvmSigner = {
        address: this.address as `0x${string}`,
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
        index: this.accountIndex 
      }, '[RobotAgent] Initialized for Sepolia');
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
      const iface = new ethers.Interface(USDT_ABI);
      const vaultIface = new ethers.Interface(VAULT_ABI);
      
      const approveData = iface.encodeFunctionData('approve', [vaultAddress, ethers.MaxUint256]);
      const depositData = vaultIface.encodeFunctionData('deposit', [usdtAmount, this.address]);
      
      logger.info({ id: this.id, amount: amountUsdt }, '[RobotAgent] Approving USDT for vault');
      const approveResult = await this.account.sendTransaction({
        to: usdtAddress,
        value: 0n,
        data: approveData
      });
      await this.provider.waitForTransaction(approveResult.hash);
      
      logger.info({ id: this.id, amount: amountUsdt }, '[RobotAgent] Depositing to vault');
      const depositResult = await this.account.sendTransaction({
        to: vaultAddress,
        value: 0n,
        data: depositData
      });
      const receipt = await this.provider.waitForTransaction(depositResult.hash);
      
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
      const aavePool = env.AAVE_V3_POOL_SEPOLIA;
      const usdtAddress = env.WDK_USDT_ADDRESS;
      
      if (!usdtAddress) {
        return { success: false, error: 'USDT address not configured' };
      }
      
      const usdtAmount = ethers.parseUnits(amountUsdt, 6);
      const iface = new ethers.Interface(USDT_ABI);
      const aaveIface = new ethers.Interface(AAVE_POOL_ABI);
      
      const approveData = iface.encodeFunctionData('approve', [aavePool, ethers.MaxUint256]);
      const supplyData = aaveIface.encodeFunctionData('supply', [usdtAddress, usdtAmount, this.address, 0]);
      
      logger.info({ id: this.id, amount: amountUsdt }, '[RobotAgent] Approving USDT for Aave');
      const approveResult = await this.account.sendTransaction({
        to: usdtAddress,
        value: 0n,
        data: approveData
      });
      await this.provider.waitForTransaction(approveResult.hash);
      
      logger.info({ id: this.id, amount: amountUsdt }, '[RobotAgent] Supplying to Aave');
      const supplyResult = await this.account.sendTransaction({
        to: aavePool,
        value: 0n,
        data: supplyData
      });
      const receipt = await this.provider.waitForTransaction(supplyResult.hash);
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
      const aavePool = env.AAVE_V3_POOL_SEPOLIA;
      const usdtAddress = env.WDK_USDT_ADDRESS;
      
      if (!usdtAddress) {
        return { success: false, error: 'USDT address not configured' };
      }
      
      const usdtAmount = ethers.parseUnits(amountUsdt, 6);
      const aaveIface = new ethers.Interface(AAVE_POOL_ABI);
      
      logger.info({ id: this.id, amount: amountUsdt }, '[RobotAgent] Withdrawing from Aave');
      const withdrawResult = await this.account.sendTransaction({
        to: aavePool,
        value: 0n,
        data: aaveIface.encodeFunctionData('withdraw', [usdtAddress, usdtAmount, this.address])
      });
      const receipt = await this.provider.waitForTransaction(withdrawResult.hash);
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
      const iface = new ethers.Interface(USDT_ABI);
      
      logger.info({ id: this.id, amount: amountUsdt, to: toAddress }, '[RobotAgent] Transferring USDT');
      const txResult = await this.account.sendTransaction({
        to: usdtAddress,
        value: 0n,
        data: iface.encodeFunctionData('transfer', [toAddress, usdtAmount])
      });
      const receipt = await this.provider.waitForTransaction(txResult.hash);
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
      const shouldAttemptDefi = Math.random() < 0.02;

      if (shouldAttemptDefi) {
        const op = defiOperations[Math.floor(Math.random() * defiOperations.length)];
        const balance = await this.getBalance();
        const minEthForGas = ethers.parseEther('0.005');
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
      const iface = new ethers.Interface(USDT_ABI);
      const vaultIface = new ethers.Interface(VAULT_ABI);

      const approveData = iface.encodeFunctionData('approve', [vaultAddress, ethers.MaxUint256]);
      try {
        await this.provider.estimateGas({ to: usdtAddress, data: approveData, from: this.address });
      } catch {
        return { success: false, error: 'USDT approve would fail (maybe not enough balance?)' };
      }

      const depositData = vaultIface.encodeFunctionData('deposit', [usdtAmount, this.address]);
      try {
        await this.provider.estimateGas({ to: vaultAddress, data: depositData, from: this.address });
      } catch {
        return { success: false, error: 'Vault deposit would fail (maybe vault paused?)' };
      }

      const approveResult = await this.account.sendTransaction({ to: usdtAddress, value: 0n, data: approveData });
      await this.provider.waitForTransaction(approveResult.hash);

      const depositResult = await this.account.sendTransaction({ to: vaultAddress, value: 0n, data: depositData });
      const receipt = await this.provider.waitForTransaction(depositResult.hash);
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
      const aavePool = env.AAVE_V3_POOL_SEPOLIA;
      const usdtAddress = env.WDK_USDT_ADDRESS;
      if (!usdtAddress) {
        return { success: false, error: 'USDT address not configured' };
      }

      const usdtAmount = ethers.parseUnits(amountUsdt, 6);
      const iface = new ethers.Interface(USDT_ABI);
      const aaveIface = new ethers.Interface(AAVE_POOL_ABI);

      const approveData = iface.encodeFunctionData('approve', [aavePool, ethers.MaxUint256]);
      try {
        await this.provider.estimateGas({ to: usdtAddress, data: approveData, from: this.address });
      } catch {
        return { success: false, error: 'USDT approve would fail' };
      }

      const supplyData = aaveIface.encodeFunctionData('supply', [usdtAddress, usdtAmount, this.address, 0]);
      try {
        await this.provider.estimateGas({ to: aavePool, data: supplyData, from: this.address });
      } catch {
        return { success: false, error: 'Aave supply would fail (maybe no liquidity?)' };
      }

      const approveResult = await this.account.sendTransaction({ to: usdtAddress, value: 0n, data: approveData });
      await this.provider.waitForTransaction(approveResult.hash);

      const supplyResult = await this.account.sendTransaction({ to: aavePool, value: 0n, data: supplyData });
      const receipt = await this.provider.waitForTransaction(supplyResult.hash);
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
      const aavePool = env.AAVE_V3_POOL_SEPOLIA;
      const usdtAddress = env.WDK_USDT_ADDRESS;
      if (!usdtAddress) {
        return { success: false, error: 'USDT address not configured' };
      }

      const usdtAmount = ethers.parseUnits(amountUsdt, 6);
      const aaveIface = new ethers.Interface(AAVE_POOL_ABI);

      const withdrawData = aaveIface.encodeFunctionData('withdraw', [usdtAddress, usdtAmount, this.address]);
      try {
        await this.provider.estimateGas({ to: aavePool, data: withdrawData, from: this.address });
      } catch {
        return { success: false, error: 'Aave withdraw would fail (no position or amount?)' };
      }

      const withdrawResult = await this.account.sendTransaction({ to: aavePool, value: 0n, data: withdrawData });
      const receipt = await this.provider.waitForTransaction(withdrawResult.hash);
      if (!receipt) {
        return { success: false, error: 'No transaction receipt for Aave withdraw' };
      }

      return { success: true, txHash: receipt.hash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  private async runHardhatTask(
    taskName: string,
    args: Record<string, string>,
    timeoutMs = 60000
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    return new Promise((resolve) => {
      const backendRoot = path.resolve(__dirname, '../../../');
      const taskArgsList = Object.entries(args)
        .filter(([, v]) => v !== undefined)
        .flatMap(([k, v]) => ['--' + k, v]);

      const child = spawn('npx', ['hardhat', taskName, ...taskArgsList, '--network', 'hashkey'], {
        cwd: backendRoot,
        timeout: timeoutMs,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          const hashMatch = stdout.match(/0x[a-fA-F0-9]{64}/);
          resolve({ success: true, txHash: hashMatch ? hashMatch[0] : undefined });
        } else {
          resolve({ success: false, error: stderr || stdout || `Hardhat task exited with code ${code}` });
        }
      });

      child.on('error', (err) => {
        resolve({ success: false, error: `Spawn error: ${err.message}` });
      });
    });
  }

  async getHashKeyBalance(): Promise<{ hsk: string; usdt: string }> {
    if (this.chain !== 'hashkey') {
      return { hsk: '0', usdt: '0' };
    }
    try {
      const hskBalance = await this.provider.getBalance(this.address);
      const usdtAddress = env.HASHKEY_USDT_ADDRESS;
      let usdtBalance = '0';
      if (usdtAddress) {
        const usdt = new ethers.Contract(usdtAddress, [
          'function balanceOf(address) view returns (uint256)'
        ], this.provider);
        usdtBalance = (await usdt.balanceOf(this.address)).toString();
      }
      return {
        hsk: ethers.formatEther(hskBalance),
        usdt: ethers.formatUnits(usdtBalance, 6)
      };
    } catch (error) {
      logger.error({ error, id: this.id }, '[RobotAgent] Failed to get HashKey balance');
      return { hsk: '0', usdt: '0' };
    }
  }

  async hashkeyTransfer(to: string, amount: string, token: 'hsk' | 'usdt' = 'hsk'): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (this.chain !== 'hashkey') {
      return { success: false, error: 'Robot not on HashKey chain' };
    }
    if (!this.signer) {
      return { success: false, error: 'Signer not initialized' };
    }
    try {
      if (token === 'hsk') {
        const amountWei = ethers.parseEther(amount);
        const tx = await this.signer.sendTransaction({ to, value: amountWei });
        const receipt = await this.provider.waitForTransaction(tx.hash);
        if (!receipt) return { success: false, error: 'No receipt' };
        logger.info({ id: this.id, to, amount, txHash: receipt.hash }, '[RobotAgent] HSK transfer sent');
        return { success: true, txHash: receipt.hash };
      } else {
        const usdtAddress = env.HASHKEY_USDT_ADDRESS;
        if (!usdtAddress) return { success: false, error: 'HASHKEY_USDT_ADDRESS not set' };
        const amountParsed = ethers.parseUnits(amount, 6);
        const iface = new ethers.Interface([
          'function transfer(address to, uint256 amount) returns (bool)'
        ]);
        const data = iface.encodeFunctionData('transfer', [to, amountParsed]);
        const tx = await this.signer.sendTransaction({ to: usdtAddress, value: 0, data });
        const receipt = await this.provider.waitForTransaction(tx.hash);
        if (!receipt) return { success: false, error: 'No receipt' };
        logger.info({ id: this.id, to, amount, txHash: receipt.hash }, '[RobotAgent] USDT transfer sent');
        return { success: true, txHash: receipt.hash };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg, id: this.id }, '[RobotAgent] HashKey transfer failed');
      return { success: false, error: msg };
    }
  }

  async hashkeyVaultDeposit(amount: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (this.chain !== 'hashkey') {
      return { success: false, error: 'Robot not on HashKey chain' };
    }
    if (!this.signer) {
      return { success: false, error: 'Signer not initialized' };
    }
    logger.info({ id: this.id, amount }, '[RobotAgent] HashKey vault deposit via Hardhat');
    return this.runHardhatTask('vault-deposit', {
      amount,
    });
  }

  async hashkeyVaultWithdraw(shares: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (this.chain !== 'hashkey') {
      return { success: false, error: 'Robot not on HashKey chain' };
    }
    if (!this.signer) {
      return { success: false, error: 'Signer not initialized' };
    }
    logger.info({ id: this.id, shares }, '[RobotAgent] HashKey vault withdraw via Hardhat');
    return this.runHardhatTask('vault-withdraw', {
      shares,
    });
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
  robotIndex: number,
  chain: Chain = 'sepolia',
  rpcUrl?: string
): Promise<RobotAgent> {
  const agent = new RobotAgent({
    id,
    type,
    accountIndex: robotIndex,
    chain,
    rpcUrl: rpcUrl ?? (chain === 'hashkey' ? env.HASHKEY_RPC_URL : env.SEPOLIA_RPC_URL)
  });
  
  await agent.initialize();
  return agent;
}
