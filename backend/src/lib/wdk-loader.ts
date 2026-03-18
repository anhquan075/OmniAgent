import { env } from '@/config/env';

let wdkInstance: any = null;
let WalletEVM: any = null;
let WalletSolana: any = null;
let WalletTON: any = null;
let WalletAccountEvm: any = null;
let bnbWdkPromise: Promise<any> | null = null;

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

export async function getWdkForBNB() {
  if (!bnbWdkPromise) {
    bnbWdkPromise = (async () => {
      const [WDK, WalletEVM] = await Promise.all([
        getWDK(),
        getWalletEVM()
      ]);
      await WDK.registerWallet('bnb', WalletEVM, { provider: env.BNB_RPC_URL } as any);
      return WDK;
    })();
  }
  return bnbWdkPromise;
}
