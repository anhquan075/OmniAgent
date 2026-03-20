import { env } from '@/config/env';
import { ethers } from 'ethers';
import { WdkSignerAdapter } from './wdk-signer-adapter';

let wdkInstance: any = null;
let WalletEVM: any = null;
let WalletSolana: any = null;
let WalletTON: any = null;
let WalletAccountEvm: any = null;
let sepoliaWdkPromise: Promise<any> | null = null;
let wdkSignerPromise: Promise<WdkSignerAdapter> | null = null;

export async function getWDK() {
  if (!wdkInstance) {
    const WDK = (await import('@tetherto/wdk')).default;
    wdkInstance = new WDK(env.WDK_SECRET_SEED);
  }
  return wdkInstance;
}

export async function getWalletEVM() {
  if (!WalletEVM) {
    const module = await import('@tetherto/wdk-wallet-evm');
    WalletEVM = module.default;
    WalletAccountEvm = module.WalletAccountEvm;
  }
  return WalletEVM;
}

export async function getWalletSolana() {
  if (!WalletSolana) {
    const module = await import('@tetherto/wdk-wallet-solana');
    WalletSolana = module.default;
  }
  return WalletSolana;
}

export async function getWalletTON() {
  if (!WalletTON) {
    const module = await import('@tetherto/wdk-wallet-ton');
    WalletTON = module.default;
  }
  return WalletTON;
}

export async function getWalletAccountEvm() {
  if (!WalletAccountEvm) {
    await getWalletEVM();
  }
  return WalletAccountEvm;
}

export async function getWdkForSepolia() {
  if (!sepoliaWdkPromise) {
    sepoliaWdkPromise = (async () => {
      const [WDK, WalletEVM] = await Promise.all([
        getWDK(),
        getWalletEVM()
      ]);
      await WDK.registerWallet('sepolia', WalletEVM, { provider: env.SEPOLIA_RPC_URL } as any);
      return WDK;
    })();
  }
  return sepoliaWdkPromise;
}

let multiChainWdkPromise: Promise<any> | null = null;

export async function getWdkMultiChain() {
  if (!multiChainWdkPromise) {
    multiChainWdkPromise = (async () => {
      const [WDK, WalletEVM, WalletSolana, WalletTON] = await Promise.all([
        getWDK(),
        getWalletEVM(),
        getWalletSolana(),
        getWalletTON()
      ]);
      await Promise.all([
        WDK.registerWallet('sepolia', WalletEVM, { provider: env.SEPOLIA_RPC_URL } as any),
        WDK.registerWallet('solana', WalletSolana, { rpcUrl: env.SOLANA_RPC_URL } as any),
        WDK.registerWallet('ton', WalletTON, { tonClient: { url: env.TON_RPC_URL, secretKey: env.TON_API_KEY } } as any)
      ]);
      return WDK;
    })();
  }
  return multiChainWdkPromise;
}

export async function getWdkSigner(rpcUrl?: string): Promise<WdkSignerAdapter> {
  const url = rpcUrl || env.SEPOLIA_RPC_URL;
  const cacheKey = url;

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
