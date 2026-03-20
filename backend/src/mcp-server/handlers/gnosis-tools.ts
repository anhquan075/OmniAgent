import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';

const PLASMA_RPC_URL = process.env.PLASMA_RPC_URL || 'https://rpc.chiadochain.net';
const CHAIN_ID = 'gnosis_chiado';

export const gnosisTools: McpTool[] = [
  {
    name: 'gnosis_createWallet',
    description: 'Create or retrieve a Gnosis Chiado wallet address from the WDK seed',
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
    outputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Gnosis wallet address' },
        network: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'gnosis_chiado',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'gnosis_getBalance',
    description: 'Get native xDAI balance for a Gnosis Chiado address',
    inputSchema: {
      type: 'object',
      properties: {
        address: {
           type: 'string',
           description: 'Gnosis wallet address (optional, defaults to main wallet). Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"',
           examples: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],
         }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        nativeBalance: { type: 'string', description: 'Native xDAI balance' },
        nativeBalanceWei: { type: 'string', description: 'Balance in wei' }
      }
    },
    version: '1.0.0',
    blockchain: 'gnosis_chiado',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'gnosis_transfer',
    description: 'Transfer native xDAI on Gnosis Chiado network',
    inputSchema: {
      type: 'object',
      properties: {
         to: {
           type: 'string',
           description: 'Recipient Gnosis address (0x-prefixed). Example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"',
           examples: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],
         },
         amount: {
           type: 'string',
           description: 'Amount in xDAI (decimal string). Example: "0.1" or "0.001"',
           examples: ["0.1", "0.01", "0.001"],
         }
      },
      required: ['to', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction hash' },
        status: { type: 'string', description: 'Transaction status' }
      }
    },
    version: '1.0.0',
    blockchain: 'gnosis_chiado',
    riskLevel: 'high',
    category: 'wallet'
  },
  {
    name: 'gnosis_getGasPrice',
    description: 'Get current gas price on Gnosis Chiado for transaction cost estimation',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        gasPrice: { type: 'string', description: 'Current gas price in wei' },
        gasPriceGwei: { type: 'string', description: 'Gas price in Gwei' }
      }
    },
    version: '1.0.0',
    blockchain: 'gnosis_chiado',
    riskLevel: 'low',
    category: 'utility'
  }
];

export async function handleGnosisTool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  const provider = new ethers.JsonRpcProvider(PLASMA_RPC_URL);
  try {
    switch (name) {
      case 'gnosis_createWallet': {
        const WalletAccountEvm = (await import('@tetherto/wdk-wallet-evm')).WalletAccountEvm;
        const walletIndex = (params.walletIndex as number) || 0;
        const account = new WalletAccountEvm(process.env.WDK_SECRET_SEED || '', "0'/" + walletIndex + "/0", { provider: PLASMA_RPC_URL });
        return { success: true, data: { address: await account.getAddress(), network: CHAIN_ID } };
      }
      case 'gnosis_getBalance': {
        let targetAddress: string;
        if (params.address) {
          targetAddress = ethers.getAddress(params.address as string);
        } else if (context.userWallet) {
          targetAddress = ethers.getAddress(context.userWallet);
        } else {
          const WalletAccountEvm = (await import('@tetherto/wdk-wallet-evm')).WalletAccountEvm;
          const account = new WalletAccountEvm(process.env.WDK_SECRET_SEED || '', "0'/0/0", { provider: PLASMA_RPC_URL });
          targetAddress = await account.getAddress();
        }
        const balance = await provider.getBalance(targetAddress);
        return {
          success: true,
          data: {
            nativeBalance: ethers.formatEther(balance),
            nativeBalanceWei: balance.toString()
          }
        };
      }
      case 'gnosis_transfer': {
        if (!params.to || !params.amount) {
          return {
            success: false,
            error: {
              code: MCP_ERRORS.INVALID_PARAMS,
              message: 'Missing required parameters. Required: to (address like "0xd8dA6BF..."), amount (xDAI amount like "0.1")'
            }
          };
        }
        const WalletAccountEvm = (await import('@tetherto/wdk-wallet-evm')).WalletAccountEvm;
        const account = new WalletAccountEvm(process.env.WDK_SECRET_SEED || '', "0'/0/0", { provider: PLASMA_RPC_URL });
        const result = await account.sendTransaction({
          to: params.to as string,
          value: ethers.parseEther(params.amount as string)
        });
        return { success: true, data: { txHash: result.hash, status: 'confirmed' } };
      }
      case 'gnosis_getGasPrice': {
        const gasPrice = await provider.getFeeData();
        return {
          success: true,
          data: {
            gasPrice: gasPrice.gasPrice?.toString() || '0',
            gasPriceGwei: gasPrice.gasPrice ? ethers.formatUnits(gasPrice.gasPrice, 'gwei') : '0'
          }
        };
      }
      default:
        return { success: false, error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: `Tool ${name} not found` } };
    }
  } catch (error) {
    return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message: String(error) } };
  }
}
