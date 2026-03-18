import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import { getPolicyGuard } from '@/agent/middleware/PolicyGuard';
import { env } from '@/config/env';
import { Connection, LAMPORTS_PER_SOL, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { getWDK, getWalletSolana } from '@/lib/wdk-loader';

let wdkPromise: Promise<any> | null = null;
let solConnection: Connection | null = null;
const policyGuard = getPolicyGuard();

async function getWdk() {
  if (!wdkPromise) {
    wdkPromise = (async () => {
      const [WDK, WalletSolana] = await Promise.all([
        getWDK(),
        getWalletSolana()
      ]);
      await WDK.registerWallet('solana', WalletSolana, { rpcUrl: env.SOLANA_RPC_URL } as any);
      return WDK;
    })();
  }
  return wdkPromise;
}

function getSolConnection() {
  if (!solConnection) {
    solConnection = new Connection(env.SOLANA_RPC_URL);
  }
  return solConnection;
}

let solKeypair: Keypair | null = null;
let bs58Promise: Promise<any> | null = null;

async function getBs58() {
  if (!bs58Promise) {
    bs58Promise = import('bs58').then(m => m.default);
  }
  return bs58Promise;
}

async function initSolKeypair() {
  if (env.SOLANA_PRIVATE_KEY && !solKeypair) {
    try {
      const bs58 = await getBs58();
      const decoded = bs58.decode(env.SOLANA_PRIVATE_KEY);
      solKeypair = Keypair.fromSecretKey(decoded);
      policyGuard.addToWhitelist(solKeypair.publicKey.toBase58());
    } catch (e) {
      console.error('[MCP] Failed to parse SOL key:', e);
    }
  }
}

export const solanaTools: McpTool[] = [
  {
    name: 'sol_createWallet',
    description: 'Create or retrieve a Solana wallet address',
    inputSchema: {
      type: 'object',
      properties: {
        walletIndex: { type: 'number', description: 'Wallet index (0 for main, 1+ for sub-wallets)', default: 0 }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Solana wallet address (base58)' },
        network: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'solana',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'sol_getBalance',
    description: 'Get native SOL and SPL token balance for a Solana address',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Solana address (optional, defaults to main wallet)' },
        tokenAddress: { type: 'string', description: 'SPL token mint address (optional)' }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        nativeBalance: { type: 'string', description: 'Native SOL balance in SOL units' },
        nativeBalanceLamport: { type: 'string', description: 'Native SOL balance in lamports' },
        tokenBalance: { type: 'string', description: 'SPL token balance' },
        tokenBalanceRaw: { type: 'string', description: 'SPL token balance in raw units' }
      }
    },
    version: '1.0.0',
    blockchain: 'solana',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'sol_transfer',
    description: 'Transfer native SOL or SPL tokens on Solana',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient Solana address (base58)' },
        amount: { type: 'string', description: 'Amount to transfer in SOL or token units' },
        tokenAddress: { type: 'string', description: 'SPL token mint address (optional, omit for native SOL)' }
      },
      required: ['to', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction signature' },
        blockNumber: { type: 'number', description: 'Slot number' },
        status: { type: 'string', description: 'Transaction status' }
      }
    },
    version: '1.0.0',
    blockchain: 'solana',
    riskLevel: 'high',
    category: 'wallet'
  },
  {
    name: 'sol_swap',
    description: 'Swap tokens on Jupiter DEX aggregator on Solana',
    inputSchema: {
      type: 'object',
      properties: {
        amountIn: { type: 'string', description: 'Input amount in token units' },
        tokenIn: { type: 'string', description: 'Input token mint address' },
        tokenOut: { type: 'string', description: 'Output token mint address' },
        slippageBps: { type: 'number', description: 'Maximum slippage in basis points', default: 50 }
      },
      required: ['amountIn', 'tokenIn', 'tokenOut']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction signature' },
        amountOut: { type: 'string', description: 'Actual output amount' }
      }
    },
    version: '1.0.0',
    blockchain: 'solana',
    riskLevel: 'high',
    category: 'defi'
  }
];

export async function handleSolanaTool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  try {
    switch (name) {
      case 'sol_createWallet': {
        const walletIndex = (params.walletIndex as number) || 0;
        const wdk = await getWdk();
        const account = await wdk.getAccount('solana', walletIndex);
        const address = await account.getAddress();
        return { success: true, data: { address, network: 'solana' } };
      }

      case 'sol_getBalance': {
        const wdk = await getWdk();
        const targetAddress = (params.address as string) || (await wdk.getAccount('solana').then((a: any) => a.getAddress()));
        
        try {
          const pubKey = new PublicKey(targetAddress);
          const balance = await getSolConnection().getBalance(pubKey);
          const balanceSol = balance / LAMPORTS_PER_SOL;
          
          return { success: true, data: {
            nativeBalance: balanceSol.toString(),
            nativeBalanceLamport: balance.toString()
          }};
        } catch (error) {
          return { success: true, data: {
            nativeBalance: '0.0',
            nativeBalanceLamport: '0',
            note: `RPC error: ${error instanceof Error ? error.message : String(error)}`
          }};
        }
      }

      case 'sol_transfer': {
        const to = params.to as string;
        const amount = params.amount as string;
        
        await initSolKeypair();
        if (!solKeypair) {
          return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message: 'Solana private key not configured' } };
        }
        
        try {
          const recipient = new PublicKey(to);
          const lamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL);
          
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: solKeypair.publicKey,
              toPubkey: recipient,
              lamports
            })
          );
          
          const signature = await sendAndConfirmTransaction(getSolConnection(), tx, [solKeypair]);
          
          return { success: true, data: { txHash: signature, status: 'confirmed' } };
        } catch (error) {
          return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message: error instanceof Error ? error.message : String(error) } };
        }
      }

      case 'sol_swap': {
        return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message: 'Jupiter DEX integration requires additional configuration' } };
      }

      default:
        return { success: false, error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: `Tool ${name} not implemented` } };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message } };
  }
}
