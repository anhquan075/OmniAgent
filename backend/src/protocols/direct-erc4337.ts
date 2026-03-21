/**
 * Direct ERC-4337 Implementation - Bypasses WDK bundler
 * Uses EntryPoint v0.7 directly with ethers.js
 * 
 * EntryPoint v0.7: 0x0000000071727De22E5E9d8BAf0EdAc6f37da032
 */

import { env } from '../config/env';
import { logger } from '@/utils/logger';
import { ethers } from 'ethers';

// EntryPoint v0.7 addresses - use env values
const ENTRY_POINT_ADDRESS = env.ERC4337_ENTRYPOINT_ADDRESS || '0x0000000071727De22E5E9d8BAf0EdAc6f37da032';
const FACTORY_ADDRESS = env.SIMPLE_ACCOUNT_FACTORY_ADDRESS || '0x9406Cc6165A9F65236A0217B72929CdaF5eC797d';

// EntryPoint ABI (minimal for our operations)
const ENTRYPOINT_ABI = [
  'function depositTo(address account) payable',
  'function balanceOf(address account) view returns (uint256)',
  'function getUserOpHash(bytes calldata userOp) view returns (bytes32)',
  'function handleOps(bytes[] calldata userOps, address payable beneficiary)',
  'function getNonce(address sender, uint192 nonceKey) view returns (uint256)',
  'function unpackUserOp(bytes calldata userOp) returns (address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)'
];

// SimpleAccountFactory ABI (our deployed version uses 1-arg functions)
const FACTORY_ABI = [
  'function getAccountAddress(address owner) view returns (address)',
  'function createAccount(address owner) returns (address)',
  'function isValidAccount(address account) view returns (bool)'
];

// SimpleAccount ABI (with session key support)
const ACCOUNT_ABI = [
  'function execute(address dest, uint256 value, bytes calldata data)',
  'function executeBatch(address[] calldata dests, uint256[] calldata values, bytes[] calldata datas)',
  'function addDeposit() payable',
  'function getBalance() view returns (uint256)',
  'function getDeposit() view returns (uint256)',
  'function withdrawNative(address payable to, uint256 amount)',
  'function owner() view returns (address)',
  'function entryPoint() view returns (address)',
  // Session key functions
  'function grantSessionKey(address sessionKey, uint256 spendingLimit, uint256 dailyLimit, address target, uint256 expiresAt)',
  'function revokeSessionKey(address sessionKey)',
  'function isSessionKeyValid(address sessionKey, uint256 value, address target) view returns (bool)',
  'function executeWithSessionKey(address sessionKey, address dest, uint256 value, bytes calldata data)',
  'function getSessionKeyData(address sessionKey) view returns (uint256 spendingLimit, uint256 dailyLimit, uint256 dailySpent, uint256 dailyResetTime, address target, uint256 expiresAt, bool revoked)'
];

// Session key interface
export interface SessionKeyData {
  spendingLimit: string;
  dailyLimit: string;
  dailySpent: string;
  dailyResetTime: number;
  target: string;
  expiresAt: number;
  revoked: boolean;
}

export interface UserOperation {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  callGasLimit: number;
  verificationGasLimit: number;
  preVerificationGas: number;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: string;
  signature: string;
}

let provider: ethers.JsonRpcProvider | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
  }
  return provider;
}

/**
 * Get wallet from WDK_SECRET_SEED
 */
export async function getWallet(): Promise<ethers.HDNodeWallet> {
  return ethers.HDNodeWallet.fromPhrase(env.WDK_SECRET_SEED);
}

/**
 * Get the expected SimpleAccount address for an owner
 */
export async function getPredictedAccountAddress(owner: string): Promise<string> {
  const provider = getProvider();
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider) as any;
  return await factory.getAccountAddress(owner);
}

/**
 * Create a new SimpleAccount for the owner
 * This deploys the account contract via the factory
 */
export async function createAccount(owner: string): Promise<{ address: string; txHash: string }> {
  const wallet = await getWallet();
  const provider = getProvider();
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider) as any;
  
  const factoryWithSigner = factory.connect(wallet);
  
  logger.info({ owner }, '[DirectERC4337] Creating account');
  
  const tx = await factoryWithSigner.createAccount(owner);
  const receipt = await tx.wait();
  
  if (!receipt) {
    throw new Error('Transaction receipt is null');
  }
  
  const accountAddress = await factory.getAccountAddress(owner);
  
  logger.info({ accountAddress, txHash: receipt.hash }, '[DirectERC4337] Account created');
  
  return { address: accountAddress, txHash: receipt.hash };
}

/**
 * Check if an account is deployed
 */
export async function isAccountDeployed(account: string): Promise<boolean> {
  const provider = getProvider();
  const code = await provider.getCode(account);
  return code.length > 2;
}

/**
 * Get account balance (ETH in account)
 */
export async function getAccountBalance(account: string): Promise<string> {
  const provider = getProvider();
  const accountContract = new ethers.Contract(account, ACCOUNT_ABI, provider);
  const balance = await accountContract.getBalance();
  return ethers.formatEther(balance);
}

/**
 * Get account deposit in EntryPoint
 */
export async function getAccountDeposit(account: string): Promise<string> {
  const provider = getProvider();
  const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, ENTRYPOINT_ABI, provider);
  const deposit = await entryPoint.balanceOf(account);
  return deposit.toString();
}

/**
 * Add ETH deposit to EntryPoint for the account (for gas)
 */
export async function addDeposit(account: string, amountEth: string): Promise<{ txHash: string; deposit: string }> {
  const wallet = await getWallet();
  const provider = getProvider();
  const entryPoint = new ethers.Contract(ENTRY_POINT_ADDRESS, ENTRYPOINT_ABI, provider);
  
  const entryPointWithSigner = entryPoint.connect(wallet) as ethers.Contract;
  const value = ethers.parseEther(amountEth);
  
  logger.info({ account, amountEth }, '[DirectERC4337] Adding deposit');
  
  const tx = await entryPointWithSigner.depositTo(account, { value });
  const receipt = await tx.wait();
  
  const newDeposit = await entryPoint.balanceOf(account);
  
  logger.info({ txHash: receipt.hash, deposit: newDeposit.toString() }, '[DirectERC4337] Deposit added');
  
  return { txHash: receipt.hash, deposit: newDeposit.toString() };
}

/**
 * Execute a transaction directly from the account (no ERC-4337 bundler)
 * Uses the owner wallet to directly call the account
 */
export async function executeDirect(
  account: string,
  to: string,
  valueEth: string,
  data: string = '0x'
): Promise<{ txHash: string }> {
  const wallet = await getWallet();
  const provider = getProvider();
  
  // The account's execute function requires the caller to be owner or EntryPoint
  // Since we're using the owner wallet directly, we need to call execute on the account
  
  // First, fund the account with ETH for gas (if it has no ETH)
  const accountBalance = await provider.getBalance(account);
  const neededValue = ethers.parseEther(valueEth);
  
  if (accountBalance < neededValue) {
    // Fund the account first
    const ownerWallet = new ethers.Wallet(wallet.privateKey, provider);
    logger.info({ account, amount: valueEth }, '[DirectERC4337] Funding account');
    const fundTx = await ownerWallet.sendTransaction({ to: account, value: neededValue });
    await fundTx.wait();
  }
  
  const accountContract = new ethers.Contract(account, ACCOUNT_ABI, wallet);
  
  logger.info({ account, to, value: valueEth }, '[DirectERC4337] Executing direct transaction');
  
  const tx = await accountContract.execute(to, neededValue, data);
  const receipt = await tx.wait();
  
  logger.info({ txHash: receipt.hash }, '[DirectERC4337] Direct transaction executed');
  
  return { txHash: receipt.hash };
}

/**
 * Execute a batch transaction from the account
 */
export async function executeBatchDirect(
  account: string,
  dests: string[],
  valuesEth: string[],
  datas: string[]
): Promise<{ txHash: string }> {
  const wallet = await getWallet();
  const provider = getProvider();
  
  // Fund account if needed
  const totalValue = valuesEth.reduce((sum, v) => sum + BigInt(ethers.parseEther(v)), 0n);
  const accountBalance = await provider.getBalance(account);
  
  if (accountBalance < totalValue) {
    const ownerWallet = new ethers.Wallet(wallet.privateKey, provider);
    const fundTx = await ownerWallet.sendTransaction({ to: account, value: totalValue });
    await fundTx.wait();
  }
  
  const accountContract = new ethers.Contract(account, ACCOUNT_ABI, wallet);
  const values = valuesEth.map(v => ethers.parseEther(v));
  
  logger.info({ account, dests: dests.length }, '[DirectERC4337] Executing batch');
  
  const tx = await accountContract.executeBatch(dests, values, datas);
  const receipt = await tx.wait();
  
  logger.info({ txHash: receipt.hash }, '[DirectERC4337] Batch executed');
  
  return { txHash: receipt.hash };
}

/**
 * Withdraw native tokens from the account
 */
export async function withdrawNative(
  account: string,
  to: string,
  amountEth: string
): Promise<{ txHash: string }> {
  const wallet = await getWallet();
  const provider = getProvider();
  const accountContract = new ethers.Contract(account, ACCOUNT_ABI, wallet);
  
  const amount = ethers.parseEther(amountEth);
  
  logger.info({ account, to, amount: amountEth }, '[DirectERC4337] Withdrawing native');
  
  const tx = await accountContract.withdrawNative(to, amount);
  const receipt = await tx.wait();
  
  logger.info({ txHash: receipt.hash }, '[DirectERC4337] Withdrawal complete');
  
  return { txHash: receipt.hash };
}

/**
 * Get account info
 */
export async function getAccountInfo(account: string): Promise<{
  owner: string;
  balance: string;
  deposit: string;
  isDeployed: boolean;
}> {
  const provider = getProvider();
  const accountContract = new ethers.Contract(account, ACCOUNT_ABI, provider);
  
  const [owner, balance, deposit] = await Promise.all([
    accountContract.owner(),
    accountContract.getBalance(),
    accountContract.getDeposit()
  ]);
  
  const isDeployed = await isAccountDeployed(account);
  
  return {
    owner,
    balance: ethers.formatEther(balance),
    deposit: deposit.toString(),
    isDeployed
  };
}

/**
 * Send ETH directly to an account (simple transfer)
 */
export async function fundAccount(account: string, amountEth: string): Promise<{ txHash: string }> {
  const wallet = await getWallet();
  const provider = getProvider();
  const ownerWallet = new ethers.Wallet(wallet.privateKey, provider);
  
  const value = ethers.parseEther(amountEth);
  
  logger.info({ to: account, amount: amountEth }, '[DirectERC4337] Funding account');
  
  const tx = await ownerWallet.sendTransaction({ to: account, value });
  const receipt = await tx.wait();
  
  if (!receipt) {
    throw new Error('Transaction receipt is null');
  }
  
  logger.info({ txHash: receipt.hash }, '[DirectERC4337] Funded');
  
  return { txHash: receipt.hash };
}

// ============ SESSION KEY FUNCTIONS ============

export interface SessionKeyParams {
  spendingLimitEth: string;
  dailyLimitEth: string;
  targetAddress?: string;
  expiresInSeconds?: number;
}

export async function createSessionKey(): Promise<{ address: string; privateKey: string }> {
  const provider = getProvider();
  const sessionWallet = ethers.Wallet.createRandom(provider);
  return {
    address: sessionWallet.address,
    privateKey: sessionWallet.privateKey
  };
}

export async function grantSessionKey(
  account: string,
  sessionKeyAddress: string,
  params: SessionKeyParams
): Promise<{ txHash: string }> {
  const wallet = await getWallet();
  const accountContract = new ethers.Contract(account, ACCOUNT_ABI, wallet);

  const spendingLimit = ethers.parseEther(params.spendingLimitEth);
  const dailyLimit = ethers.parseEther(params.dailyLimitEth);
  const target = params.targetAddress || ethers.ZeroAddress;
  const expiresAt = Math.floor(Date.now() / 1000) + (params.expiresInSeconds || 86400);

  logger.info({ account, sessionKey: sessionKeyAddress, spendingLimit: params.spendingLimitEth }, '[DirectERC4337] Granting session key');

  const tx = await accountContract.grantSessionKey(
    sessionKeyAddress,
    spendingLimit,
    dailyLimit,
    target,
    expiresAt
  );
  const receipt = await tx.wait();

  logger.info({ txHash: receipt.hash }, '[DirectERC4337] Session key granted');

  return { txHash: receipt.hash };
}

export async function revokeSessionKey(
  account: string,
  sessionKeyAddress: string
): Promise<{ txHash: string }> {
  const wallet = await getWallet();
  const accountContract = new ethers.Contract(account, ACCOUNT_ABI, wallet);

  logger.info({ account, sessionKey: sessionKeyAddress }, '[DirectERC4337] Revoking session key');

  const tx = await accountContract.revokeSessionKey(sessionKeyAddress);
  const receipt = await tx.wait();

  logger.info({ txHash: receipt.hash }, '[DirectERC4337] Session key revoked');

  return { txHash: receipt.hash };
}

export async function isSessionKeyValid(
  account: string,
  sessionKeyAddress: string,
  valueEth: string,
  targetAddress: string
): Promise<boolean> {
  const provider = getProvider();
  const accountContract = new ethers.Contract(account, ACCOUNT_ABI, provider);

  const value = ethers.parseEther(valueEth);

  return await accountContract.isSessionKeyValid(sessionKeyAddress, value, targetAddress);
}

export async function getSessionKeyData(
  account: string,
  sessionKeyAddress: string
): Promise<SessionKeyData> {
  const provider = getProvider();
  const accountContract = new ethers.Contract(account, ACCOUNT_ABI, provider);

  const data = await accountContract.getSessionKeyData(sessionKeyAddress);

  return {
    spendingLimit: ethers.formatEther(data[0]),
    dailyLimit: ethers.formatEther(data[1]),
    dailySpent: ethers.formatEther(data[2]),
    dailyResetTime: Number(data[3]),
    target: data[4],
    expiresAt: Number(data[5]),
    revoked: data[6]
  };
}

export async function executeWithSessionKey(
  account: string,
  sessionKeyPrivateKey: string,
  to: string,
  valueEth: string,
  data: string = '0x'
): Promise<{ txHash: string }> {
  const provider = getProvider();
  const sessionWallet = new ethers.Wallet(sessionKeyPrivateKey, provider);

  const accountContract = new ethers.Contract(account, ACCOUNT_ABI, sessionWallet);
  const value = ethers.parseEther(valueEth);

  logger.info({ account, to, value: valueEth, sessionKey: sessionWallet.address }, '[DirectERC4337] Execute with session key');

  const tx = await accountContract.executeWithSessionKey(sessionWallet.address, to, value, data);
  const receipt = await tx.wait();

  logger.info({ txHash: receipt.hash }, '[DirectERC4337] Session key execution complete');

  return { txHash: receipt.hash };
}
