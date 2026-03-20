import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
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

  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });

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
