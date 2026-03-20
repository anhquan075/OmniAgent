import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';

const ARBITRUM_RPC = process.env.ARBITRUM_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const CHAIN_ID = 'arbitrum_sepolia';

export const arbitrumTools: McpTool[] = [
  {
    name: 'arbitrum_createWallet',
    description: 'Create or retrieve an Arbitrum Sepolia wallet address from the WDK seed',
    inputSchema: {
      type: 'object',
      properties: {
        walletIndex: {
           type: 'number',
           description: 'Wallet derivation index (0 for main wallet, 1+ for sub-wallets). Example: 0',
           default: 0,
           examples: ["0", "1", "2"],
         }
      }
    },
    outputSchema: { type: 'object', properties: { address: { type: 'string' }, network: { type: 'string' } } },
    version: '1.0.0',
    blockchain: 'arbitrum_sepolia',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'arbitrum_getBalance',
    description: 'Get native ETH balance for an Arbitrum Sepolia address',
    inputSchema: {
      type: 'object',
      properties: {
        address: {
           type: 'string',
           description: 'Arbitrum wallet address (optional, defaults to main wallet). Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"',
           examples: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],
         }
      },
      required: []
    },
    outputSchema: { type: 'object', properties: { nativeBalance: { type: 'string' }, nativeBalanceWei: { type: 'string' } } },
    version: '1.0.0',
    blockchain: 'arbitrum_sepolia',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'arbitrum_transfer',
    description: 'Transfer native ETH on Arbitrum Sepolia network',
    inputSchema: {
      type: 'object',
      properties: {
         to: {
           type: 'string',
           description: 'Recipient Arbitrum address (0x-prefixed). Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"',
           examples: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],
         },
         amount: {
           type: 'string',
           description: 'Amount in ETH (decimal string). Example: "0.001" or "0.5"',
           examples: ["0.001", "0.01", "0.1"],
         }
      },
      required: ['to', 'amount']
    },
    outputSchema: { type: 'object', properties: { txHash: { type: 'string' }, status: { type: 'string' } } },
    version: '1.0.0',
    blockchain: 'arbitrum_sepolia',
    riskLevel: 'high',
    category: 'wallet'
  },
  {
    name: 'arbitrum_getGasPrice',
    description: 'Get current gas price on Arbitrum Sepolia for transaction cost estimation',
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: { gasPrice: { type: 'string' }, gasPriceGwei: { type: 'string' } } },
    version: '1.0.0',
    blockchain: 'arbitrum_sepolia',
    riskLevel: 'low',
    category: 'utility'
  }
];

export async function handleArbitrumTool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  const provider = new ethers.JsonRpcProvider(ARBITRUM_RPC);
  try {
    switch (name) {
      case 'arbitrum_createWallet': {
        const WalletAccountEvm = (await import('@tetherto/wdk-wallet-evm')).WalletAccountEvm;
        const walletIndex = (params.walletIndex as number) || 0;
        const account = new WalletAccountEvm(process.env.WDK_SECRET_SEED || '', "0'/" + walletIndex + "/0", { provider: ARBITRUM_RPC });
        return { success: true, data: { address: await account.getAddress(), network: CHAIN_ID } };
      }
      case 'arbitrum_getBalance': {
        let targetAddress: string;
        if (params.address) {
          targetAddress = ethers.getAddress(params.address as string);
        } else if (context.userWallet) {
          targetAddress = ethers.getAddress(context.userWallet);
        } else {
          const WalletAccountEvm = (await import('@tetherto/wdk-wallet-evm')).WalletAccountEvm;
          const account = new WalletAccountEvm(process.env.WDK_SECRET_SEED || '', "0'/0/0", { provider: ARBITRUM_RPC });
          targetAddress = await account.getAddress();
        }
        const balance = await provider.getBalance(targetAddress);
        return { success: true, data: { nativeBalance: ethers.formatEther(balance), nativeBalanceWei: balance.toString() } };
      }
      case 'arbitrum_transfer': {
        if (!params.to || !params.amount) {
          return {
            success: false,
            error: {
              code: MCP_ERRORS.INVALID_PARAMS,
              message: 'Missing required parameters. Required: to (address like "0xd8dA6BF..."), amount (ETH amount like "0.001")'
            }
          };
        }
        const WalletAccountEvm = (await import('@tetherto/wdk-wallet-evm')).WalletAccountEvm;
        const account = new WalletAccountEvm(process.env.WDK_SECRET_SEED || '', "0'/0/0", { provider: ARBITRUM_RPC });
        const result = await account.sendTransaction({
          to: params.to as string,
          value: ethers.parseEther(params.amount as string)
        });
        return { success: true, data: { txHash: result.hash, status: 'confirmed' } };
      }
      case 'arbitrum_getGasPrice': {
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
