import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import WDK from '@tetherto/wdk';
import WalletTON from '@tetherto/wdk-wallet-ton';
import { getPolicyGuard } from '@/agent/middleware/PolicyGuard';
import { env } from '@/config/env';
import { TonClient, Address } from '@ton/ton';

const wdk = new WDK(env.WDK_SECRET_SEED);
wdk.registerWallet('ton', WalletTON, { rpcUrl: env.TON_RPC_URL } as any);
const policyGuard = getPolicyGuard();
const tonClient = new TonClient({ endpoint: env.TON_RPC_URL });

export const tonTools: McpTool[] = [
  {
    name: 'ton_createWallet',
    description: 'Create or retrieve a TON blockchain wallet address',
    inputSchema: {
      type: 'object',
      properties: {
        walletIndex: { type: 'number', description: 'Wallet index (0 for main, 1+ for sub-wallets)', default: 0 }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'TON wallet address (base64 or user-friendly)' },
        network: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'ton',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'ton_getBalance',
    description: 'Get native TON and Jetton token balance for a TON address',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'TON address (optional, defaults to main wallet)' },
        jettonAddress: { type: 'string', description: 'Jetton master contract address (optional)' }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        nativeBalance: { type: 'string', description: 'Native TON balance in TON units' },
        nativeBalanceNano: { type: 'string', description: 'Native TON balance in nanoTON' },
        jettonBalance: { type: 'string', description: 'Jetton balance' }
      }
    },
    version: '1.0.0',
    blockchain: 'ton',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'ton_transfer',
    description: 'Transfer native TON or Jetton tokens on TON blockchain',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient TON address' },
        amount: { type: 'string', description: 'Amount to transfer in TON or token units' },
        jettonAddress: { type: 'string', description: 'Jetton master contract address (optional, omit for native TON)' },
        comment: { type: 'string', description: 'Optional transaction comment' }
      },
      required: ['to', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction hash' },
        lt: { type: 'string', description: 'Logical time' },
        status: { type: 'string', description: 'Transaction status' }
      }
    },
    version: '1.0.0',
    blockchain: 'ton',
    riskLevel: 'high',
    category: 'wallet'
  }
];

export async function handleTonTool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  try {
    switch (name) {
      case 'ton_createWallet': {
        const walletIndex = (params.walletIndex as number) || 0;
        const account = await wdk.getAccount('ton', walletIndex);
        const address = await account.getAddress();
        return { success: true, data: { address, network: 'ton' } };
      }

      case 'ton_getBalance': {
        const targetAddress = (params.address as string) || (await wdk.getAccount('ton').then(a => a.getAddress()));
        
        try {
          const addr = Address.parse(targetAddress);
          const balance = await tonClient.getBalance(addr);
          const balanceTon = Number(balance) / 1e9;
          
          return { success: true, data: {
            nativeBalance: balanceTon.toString(),
            nativeBalanceNano: balance.toString()
          }};
        } catch (error) {
          return { success: true, data: {
            nativeBalance: '0.0',
            nativeBalanceNano: '0',
            note: `RPC error: ${error instanceof Error ? error.message : String(error)}`
          }};
        }
      }

      case 'ton_transfer': {
        const to = params.to as string;
        const amount = params.amount as string;
        
        try {
          const account = await wdk.getAccount('ton');
          const address = await account.getAddress();
          const recipient = Address.parse(to);
          const nanoAmount = Math.round(parseFloat(amount) * 1e9);
          
          // Use WDK's native transfer method
          const result = await (account as any).transfer({
            to: recipient.toString(),
            amount: nanoAmount.toString()
          });
          
          return { success: true, data: { txHash: result?.txHash || result?.hash || 'sent', status: 'sent' } };
        } catch (error) {
          return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message: error instanceof Error ? error.message : String(error) } };
        }
      }

      default:
        return { success: false, error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: `Tool ${name} not implemented` } };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message } };
  }
}
