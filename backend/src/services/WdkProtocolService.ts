import { env } from '@/config/env';
import { logger } from '@/utils/logger';

let AaveProtocolEvm: any = null;
let Usdt0ProtocolEvm: any = null;
let VeloraProtocolEvm: any = null;
let aaveInstance: any = null;
let bridgeInstance: any = null;
let swapInstance: any = null;

const ORACLE_MAX_AGE_SECONDS = 300;

let lastOracleUpdate: number = Date.now();

export function validateOracleFreshness(): { fresh: boolean; reason: string; ageSeconds: number } {
  const ageSeconds = (Date.now() - lastOracleUpdate) / 1000;
  if (ageSeconds > ORACLE_MAX_AGE_SECONDS) {
    return {
      fresh: false,
      reason: `Oracle data is stale (${Math.round(ageSeconds)}s old). Max allowed: ${ORACLE_MAX_AGE_SECONDS}s`,
      ageSeconds
    };
  }
  return { fresh: true, reason: '', ageSeconds };
}

export function touchOracle(): void {
  lastOracleUpdate = Date.now();
}

async function getWdkAccount() {
  const WalletAccountEvm = (await import('@tetherto/wdk-wallet-evm')).WalletAccountEvm;
  return new WalletAccountEvm(env.WDK_SECRET_SEED, "0'/0/0", {
    provider: env.SEPOLIA_RPC_URL
  });
}

async function loadAaveModule() {
  if (!AaveProtocolEvm) {
    AaveProtocolEvm = (await import('@tetherto/wdk-protocol-lending-aave-evm')).default;
  }
  return AaveProtocolEvm;
}

async function loadBridgeModule() {
  if (!Usdt0ProtocolEvm) {
    Usdt0ProtocolEvm = (await import('@tetherto/wdk-protocol-bridge-usdt0-evm')).default;
  }
  return Usdt0ProtocolEvm;
}

async function loadSwapModule() {
  if (!VeloraProtocolEvm) {
    VeloraProtocolEvm = (await import('@tetherto/wdk-protocol-swap-velora-evm')).default;
  }
  return VeloraProtocolEvm;
}

export async function getAaveProtocol() {
  if (!aaveInstance) {
    const [Protocol, account] = await Promise.all([
      loadAaveModule(),
      getWdkAccount()
    ]);
    aaveInstance = new Protocol(account);
    logger.info('[WdkProtocolService] Aave lending module initialized');
  }
  return aaveInstance;
}

export async function getBridgeProtocol() {
  if (!bridgeInstance) {
    const [Protocol, account] = await Promise.all([
      loadBridgeModule(),
      getWdkAccount()
    ]);
    bridgeInstance = new Protocol(account, {
      bridgeMaxFee: 1000000000000000n
    });
    logger.info('[WdkProtocolService] USD₮0 bridge module initialized');
  }
  return bridgeInstance;
}

export async function getSwapProtocol() {
  if (!swapInstance) {
    const [Protocol, account] = await Promise.all([
      loadSwapModule(),
      getWdkAccount()
    ]);
    swapInstance = new Protocol(account, {
      swapMaxFee: 200000000000000n
    });
    logger.info('[WdkProtocolService] Velora swap module initialized');
  }
  return swapInstance;
}

export const TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
  mainnet: {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    XAUT: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  },
  sepolia: {
    USDT: env.WDK_USDT_ADDRESS || '',
    XAUT: '',
    WETH: ''
  }
};

export const SUPPORTED_CHAINS = [
  'ethereum', 'arbitrum', 'optimism', 'polygon', 'berachain',
  'plasma', 'avalanche', 'celo', 'mantle', 'sei', 'stable'
];

export async function supplyToAave(token: string, amount: bigint) {
  const aave = await getAaveProtocol();
  const result = await aave.supply({ token, amount });
  logger.info({ txHash: result.hash, token, amount: amount.toString() }, '[WdkProtocolService] Aave supply');
  return result;
}

export async function withdrawFromAave(token: string, amount: bigint) {
  const aave = await getAaveProtocol();
  const result = await aave.withdraw({ token, amount });
  logger.info({ txHash: result.hash, token, amount: amount.toString() }, '[WdkProtocolService] Aave withdraw');
  return result;
}

export async function borrowFromAave(token: string, amount: bigint) {
  const aave = await getAaveProtocol();
  const result = await aave.borrow({ token, amount });
  logger.info({ txHash: result.hash, token, amount: amount.toString() }, '[WdkProtocolService] Aave borrow');
  return result;
}

export async function repayToAave(token: string, amount: bigint) {
  const aave = await getAaveProtocol();
  const result = await aave.repay({ token, amount });
  logger.info({ txHash: result.hash, token, amount: amount.toString() }, '[WdkProtocolService] Aave repay');
  return result;
}

export async function getAaveAccountData() {
  const aave = await getAaveProtocol();
  const data = await aave.getAccountData();
  touchOracle();
  return data;
}

export async function bridgeUsdt0(targetChain: string, recipient: string, token: string, amount: bigint) {
  const bridge = await getBridgeProtocol();
  const result = await bridge.bridge({ targetChain, recipient, token, amount });
  logger.info({ txHash: result.hash, targetChain, amount: amount.toString() }, '[WdkProtocolService] USD₮0 bridge');
  return result;
}

export async function quoteBridgeUsdt0(targetChain: string, recipient: string, token: string, amount: bigint) {
  const bridge = await getBridgeProtocol();
  return bridge.quoteBridge({ targetChain, recipient, token, amount });
}

export async function swapTokens(tokenIn: string, tokenOut: string, tokenInAmount: bigint) {
  const swap = await getSwapProtocol();
  const result = await swap.swap({ tokenIn, tokenOut, tokenInAmount });
  logger.info({ txHash: result.hash, tokenIn, tokenOut, amount: tokenInAmount.toString() }, '[WdkProtocolService] Velora swap');
  return result;
}

export async function quoteSwapTokens(tokenIn: string, tokenOut: string, tokenInAmount: bigint) {
  const swap = await getSwapProtocol();
  return swap.quoteSwap({ tokenIn, tokenOut, tokenInAmount });
}
