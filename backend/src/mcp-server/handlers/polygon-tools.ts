import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';

const POLYGON_RPC = process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology';
const CHAIN_ID = 'polygon_amoy';

export const polygonTools: McpTool[] = [
  {
    name: 'polygon_createWallet',
    description: 'Create or retrieve a Polygon Amoy wallet address',
    inputSchema: {
      type: 'object',
      properties: {
        walletIndex: { type: 'number', description: 'Wallet index (0 for main, 1+ for sub-wallets)', default: 0 }
      }
    },
    outputSchema: { type: 'object', properties: { address: { type: 'string' }, network: { type: 'string' } } },
    version: '1.0.0',
    blockchain: 'polygon_amoy',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'polygon_getBalance',
    description: 'Get native MATIC balance for a Polygon Amoy address',
    inputSchema: {
      type: 'object',
      properties: { address: { type: 'string', description: 'Polygon address (optional)' } },
      required: []
    },
    outputSchema: { type: 'object', properties: { nativeBalance: { type: 'string' }, nativeBalanceWei: { type: 'string' } } },
    version: '1.0.0',
    blockchain: 'polygon_amoy',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'polygon_transfer',
    description: 'Transfer native MATIC on Polygon Amoy',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient Polygon address' },
        amount: { type: 'string', description: 'Amount in MATIC' }
      },
      required: ['to', 'amount']
    },
    outputSchema: { type: 'object', properties: { txHash: { type: 'string' }, status: { type: 'string' } } },
    version: '1.0.0',
    blockchain: 'polygon_amoy',
    riskLevel: 'high',
    category: 'wallet'
  },
  {
    name: 'polygon_getGasPrice',
    description: 'Get current gas price on Polygon Amoy',
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: { gasPrice: { type: 'string' }, gasPriceGwei: { type: 'string' } } },
    version: '1.0.0',
    blockchain: 'polygon_amoy',
    riskLevel: 'low',
    category: 'utility'
  }
];

export async function handlePolygonTool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
  try {
    switch (name) {
      case 'polygon_createWallet': {
        const WalletAccountEvm = (await import('@tetherto/wdk-wallet-evm')).WalletAccountEvm;
        const walletIndex = (params.walletIndex as number) || 0;
        const account = new WalletAccountEvm(process.env.WDK_SECRET_SEED || '', "0'/" + walletIndex + "/0", { provider: POLYGON_RPC });
        return { success: true, data: { address: await account.getAddress(), network: CHAIN_ID } };
      }
      case 'polygon_getBalance': {
        let targetAddress: string;
        if (params.address) {
          targetAddress = ethers.getAddress(params.address as string);
        } else if (context.userWallet) {
          targetAddress = ethers.getAddress(context.userWallet);
        } else {
          const WalletAccountEvm = (await import('@tetherto/wdk-wallet-evm')).WalletAccountEvm;
          const account = new WalletAccountEvm(process.env.WDK_SECRET_SEED || '', "0'/0/0", { provider: POLYGON_RPC });
          targetAddress = await account.getAddress();
        }
        const balance = await provider.getBalance(targetAddress);
        return { success: true, data: { nativeBalance: ethers.formatEther(balance), nativeBalanceWei: balance.toString() } };
      }
      case 'polygon_transfer': {
        if (!params.to || !params.amount) return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'to and amount required' } };
        const WalletAccountEvm = (await import('@tetherto/wdk-wallet-evm')).WalletAccountEvm;
        const account = new WalletAccountEvm(process.env.WDK_SECRET_SEED || '', "0'/0/0", { provider: POLYGON_RPC });
        const wallet = new ethers.Wallet(account as any, provider);
        const tx = await wallet.sendTransaction({ to: params.to as string, value: ethers.parseEther(params.amount as string) });
        await tx.wait();
        return { success: true, data: { txHash: tx.hash, status: 'confirmed' } };
      }
      case 'polygon_getGasPrice': {
        const gasPrice = await provider.getFeeData();
        return { success: true, data: { gasPrice: gasPrice.gasPrice?.toString() || '0', gasPriceGwei: gasPrice.gasPrice ? ethers.formatUnits(gasPrice.gasPrice, 'gwei') : '0' } };
      }
      default:
        return { success: false, error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: 'Tool not found' } };
    }
  } catch (error) {
    return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message: String(error) } };
  }
}
