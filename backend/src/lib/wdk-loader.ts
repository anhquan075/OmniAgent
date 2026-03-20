import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { ethers } from 'ethers';
import { WdkSignerAdapter } from './wdk-signer-adapter';

// Wallet Managers
let wdkInstance: any = null;
let WalletEVM: any = null;
let WalletAccountEvm: any = null;
let WalletManagerErc4337: any = null;

// Protocol Modules (lazy loaded)
let VeloraProtocolEvm: any = null;
let AaveProtocolEvm: any = null;
let Usdt0ProtocolEvm: any = null;

// Cached instances
let sepoliaWdkPromise: Promise<any> | null = null;
let wdkSignerPromise: Promise<WdkSignerAdapter> | null = null;

/** Initialize WDK with seed phrase (docs.wdk.tether.io/sdk/core/configuration) */
export async function getWDK() {
  if (!wdkInstance) {
    const WDK = (await import('@tetherto/wdk')).default;
    wdkInstance = new WDK(env.WDK_SECRET_SEED);
  }
  return wdkInstance;
}

/** Get EVM wallet manager (docs.wdk.tether.io/sdk/wallet-modules/wallet-evm) */
export async function getWalletEVM() {
  if (!WalletEVM) {
    const module = await import('@tetherto/wdk-wallet-evm');
    WalletEVM = module.default;
    WalletAccountEvm = module.WalletAccountEvm;
  }
  return WalletEVM;
}

export async function getWalletAccountEvm() {
  if (!WalletAccountEvm) {
    await getWalletEVM();
  }
  return WalletAccountEvm;
}

/** Get ERC-4337 Smart Account Wallet Manager from @tetherto/wdk-wallet-evm-erc-4337 */
export async function getERC4337Wallet() {
  if (!WalletManagerErc4337) {
    const module = await import('@tetherto/wdk-wallet-evm-erc-4337');
    WalletManagerErc4337 = module.default;
  }
  return WalletManagerErc4337;
}

/** Official Pimlico Sepolia config for ERC-4337 (docs.wdk.tether.io) */
export async function getERC4337Config() {
  return {
    chainId: 11155111,
    provider: env.SEPOLIA_RPC_URL,
    bundlerUrl: env.ERC4337_BUNDLER_URL || 'https://public.pimlico.io/v2/11155111/rpc',
    paymasterUrl: env.ERC4337_PAYMASTER_URL || 'https://public.pimlico.io/v2/11155111/rpc',
    paymasterAddress: env.ERC4337_PAYMASTER_ADDRESS,
    entryPointAddress: env.ERC4337_ENTRYPOINT_ADDRESS,
    safeModulesVersion: env.ERC4337_SAFE_MODULES_VERSION || '0.3.0',
    paymasterToken: { address: env.ERC4337_USDT_TOKEN },
    transferMaxFee: Number(env.ERC4337_TRANSFER_MAX_FEE) || 100000
  };
}

/** Create ERC-4337 WalletManager instance for account operations */
export async function createERC4337Wallet(seedPhrase?: string, index: number = 0) {
  const ERC4337 = await getERC4337Wallet();
  const config = await getERC4337Config();
  const seed = seedPhrase || env.WDK_SECRET_SEED;
  return new ERC4337(seed, config);
}

// ==================== Protocol Loaders ====================

/** Load Velora swap protocol */
async function loadVeloraProtocol() {
  if (!VeloraProtocolEvm) {
    VeloraProtocolEvm = (await import('@tetherto/wdk-protocol-swap-velora-evm')).default;
  }
  return VeloraProtocolEvm;
}

/** Load Aave lending protocol */
async function loadAaveProtocol() {
  if (!AaveProtocolEvm) {
    AaveProtocolEvm = (await import('@tetherto/wdk-protocol-lending-aave-evm')).default;
  }
  return AaveProtocolEvm;
}

/** Load USD₮0 bridge protocol */
async function loadUsdt0Protocol() {
  if (!Usdt0ProtocolEvm) {
    Usdt0ProtocolEvm = (await import('@tetherto/wdk-protocol-bridge-usdt0-evm')).default;
  }
  return Usdt0ProtocolEvm;
}

// ==================== WDK Instance with Protocols ====================

/**
 * Initialize WDK with wallet + protocol registration.
 * Official pattern: wdk.registerWallet().registerProtocol().registerProtocol()
 * @see https://docs.wdk.tether.io/sdk/core/configuration
 */
export async function getWdkForSepolia() {
  if (!sepoliaWdkPromise) {
    sepoliaWdkPromise = (async () => {
      const [WDK, WalletEVM, Velora, Aave, Usdt0] = await Promise.all([
        getWDK(),
        getWalletEVM(),
        loadVeloraProtocol(),
        loadAaveProtocol(),
        loadUsdt0Protocol()
      ]);

      // Register wallet
      WDK.registerWallet('sepolia', WalletEVM, {
        provider: env.SEPOLIA_RPC_URL
      });

      // Register protocols (official pattern)
      WDK.registerProtocol('sepolia', 'velora', Velora);
      WDK.registerProtocol('sepolia', 'aave', Aave);
      WDK.registerProtocol('sepolia', 'usdt0', Usdt0);

      logger.info('[wdk-loader] WDK initialized with wallet + 3 protocols for Sepolia');
      return WDK;
    })();
  }
  return sepoliaWdkPromise;
}

export async function getWdkMultiChain() {
  return getWdkForSepolia();
}

/**
 * Get account with protocol access.
 * Official pattern: const account = await wdk.getAccount('sepolia', 0)
 * account.getSwapProtocol('velora')
 * account.getLendingProtocol('aave')
 * account.getBridgeProtocol('usdt0')
 */
export async function getWdkAccount(accountIndex: number = 0) {
  const wdk = await getWdkForSepolia();
  return wdk.getAccount('sepolia', accountIndex);
}

export async function getWdkSigner(rpcUrl?: string): Promise<WdkSignerAdapter> {
  const url = rpcUrl || env.SEPOLIA_RPC_URL;

  if (!wdkSignerPromise) {
    wdkSignerPromise = (async () => {
      const AccountEvm = await getWalletAccountEvm();
      const wdkAccount = new AccountEvm(env.WDK_SECRET_SEED, '0\'/0/0', { provider: url });
      const provider = new ethers.JsonRpcProvider(url);
      return new WdkSignerAdapter(wdkAccount, provider);
    })();
  }
  return wdkSignerPromise;
}
