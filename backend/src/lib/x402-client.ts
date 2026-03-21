import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { ClientEvmSigner } from '@x402/evm';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

let x402FetchInstance: typeof fetch | null = null;

export async function getX402Client() {
  if (x402FetchInstance) {
    return x402FetchInstance;
  }

  const { default: WalletManagerEvm } = await import('@tetherto/wdk-wallet-evm');
  const walletManager = new WalletManagerEvm(env.WDK_SECRET_SEED, {
    provider: env.SEPOLIA_RPC_URL
  });
  const account = await walletManager.getAccount();
  
  const signer: ClientEvmSigner = {
    address: account.address as `0x${string}`,
    async signTypedData(message) {
      return account.signTypedData(message as any) as Promise<`0x${string}`>;
    },
  };

  const client = new x402Client();
  registerExactEvmScheme(client, { signer });

  x402FetchInstance = wrapFetchWithPayment(fetch, client);
  logger.info('[x402] Client initialized with Semantic facilitator');

  return x402FetchInstance;
}

export async function payForX402Resource(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const fetchWithPayment = await getX402Client();
  return fetchWithPayment(url, options);
}
