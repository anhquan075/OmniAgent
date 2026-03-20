import { env } from '../config/env';
import { logger } from '@/utils/logger';
import { ethers } from 'ethers';

/**
 * ERC-4337 Smart Account using official WDK WalletManagerEvmErc4337
 * Based on: https://docs.wdk.tether.io/sdk/wallet-modules/wallet-evm-erc-4337/configuration
 */

let WalletManagerEvmErc4337: any = null;

// SimpleAccountFactory ABI (for address prediction)
const FACTORY_ABI = [
  'function getAddress(address owner, uint256 salt) view returns (address)',
  'function ownerOf(address account) view returns (address)'
];

// Smart Account ABI (for deposits, withdrawals, approvals)
const ACCOUNT_ABI = [
  'function getDeposit() view returns (uint256)',
  'function withdrawToken(address token, address to, uint256 amount)',
  'function withdrawNative(address to, uint256 amount)',
  'function setTokenApproval(address token, bool approved, uint256 rate)',
  'function isTokenApproved(address token) view returns (bool)'
];

export const erc4337Config = {
  chainId: 11155111,
  provider: env.SEPOLIA_RPC_URL,
  bundlerUrl: env.ERC4337_BUNDLER_URL,
  paymasterUrl: env.ERC4337_PAYMASTER_URL,
  paymasterAddress: env.ERC4337_PAYMASTER_ADDRESS,
  entryPointAddress: env.ERC4337_ENTRYPOINT_ADDRESS, // v0.7
  safeModulesVersion: env.ERC4337_SAFE_MODULES_VERSION,
  paymasterToken: { address: env.ERC4337_USDT_TOKEN },
  transferMaxFee: env.ERC4337_TRANSFER_MAX_FEE
};

// Official SimpleAccountFactory on Sepolia
const DEFAULT_FACTORY_ADDRESS = '0x9406Cc6165A9F65236A0217B72929CdaF5eC797d';

function getProvider() {
  return new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
}

/** Get SimpleAccountFactory contract for address prediction */
export function getFactoryContract(factoryAddress?: string) {
  const provider = getProvider();
  const address = factoryAddress || DEFAULT_FACTORY_ADDRESS;
  return new ethers.Contract(address, FACTORY_ABI, provider);
}

/** Get smart account contract instance for direct calls */
export function getAccountContract(accountAddress: string) {
  const provider = getProvider();
  return new ethers.Contract(accountAddress, ACCOUNT_ABI, provider);
}

async function loadWalletManager() {
  if (!WalletManagerEvmErc4337) {
    const module = await import('@tetherto/wdk-wallet-evm-erc-4337');
    WalletManagerEvmErc4337 = module.default;
    logger.info('[ERC4337] WalletManagerEvmErc4337 loaded');
  }
  return WalletManagerEvmErc4337;
}

export async function getErc4337Wallet(seedPhrase?: string) {
  const WalletManager = await loadWalletManager();
  const seed = seedPhrase || env.WDK_SECRET_SEED;
  return new WalletManager(seed, erc4337Config);
}

export async function createErc4337Account(seedPhrase?: string) {
  const wallet = await getErc4337Wallet(seedPhrase);
  const account = wallet.getAccount(0);
  const address = await account.getAddress();
  logger.info({ address }, '[ERC4337] Account created/retrieved');
  return { wallet, account, address };
}

export async function executeErc4337Transaction(
  to: string,
  value: string,
  data: string,
  seedPhrase?: string
) {
  const wallet = await getErc4337Wallet(seedPhrase);
  const tx = await wallet.execute(to, BigInt(value), data);
  logger.info({ txHash: tx.hash }, '[ERC4337] Transaction executed');
  return tx;
}

export async function executeErc4337Batch(
  dests: string[],
  values: string[],
  datas: string[],
  seedPhrase?: string
) {
  const wallet = await getErc4337Wallet(seedPhrase);
  const bigIntValues = values.map(v => BigInt(v));
  const tx = await wallet.executeBatch(dests, bigIntValues, datas);
  logger.info({ txHash: tx.hash }, '[ERC4337] Batch transaction executed');
  return tx;
}

export async function getErc4337Balance(seedPhrase?: string) {
  const wallet = await getErc4337Wallet(seedPhrase);
  return await wallet.getBalance();
}

export async function getErc4337Deposit(seedPhrase?: string) {
  const wallet = await getErc4337Wallet(seedPhrase);
  return await wallet.getDeposit();
}

export async function addErc4337Deposit(amount: string, seedPhrase?: string) {
  const wallet = await getErc4337Wallet(seedPhrase);
  const tx = await wallet.addDeposit({ value: BigInt(amount) });
  logger.info({ txHash: tx.hash, amount }, '[ERC4337] Deposit added');
  return tx;
}

export async function withdrawErc4337Native(to: string, amount: string, seedPhrase?: string) {
  const wallet = await getErc4337Wallet(seedPhrase);
  const tx = await wallet.withdrawNative(to, BigInt(amount));
  logger.info({ txHash: tx.hash, to, amount }, '[ERC4337] Native withdrawal');
  return tx;
}

export async function withdrawErc4337Token(token: string, to: string, amount: string, seedPhrase?: string) {
  const wallet = await getErc4337Wallet(seedPhrase);
  const tx = await wallet.withdrawToken(token, to, BigInt(amount));
  logger.info({ txHash: tx.hash, token, to, amount }, '[ERC4337] Token withdrawal');
  return tx;
}

export async function setTokenApprovalForPaymaster(token: string, approved: boolean, rate: string, seedPhrase?: string) {
  const wallet = await getErc4337Wallet(seedPhrase);
  const tx = await wallet.setTokenApproval(token, approved, BigInt(rate));
  logger.info({ txHash: tx.hash, token, approved }, '[ERC4337] Token approval set');
  return tx;
}

export async function isTokenApprovedForPaymaster(token: string, seedPhrase?: string) {
  const wallet = await getErc4337Wallet(seedPhrase);
  return await wallet.isTokenApproved(token);
}
