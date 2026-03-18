import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import { getPolicyGuard } from '@/agent/middleware/PolicyGuard';
import { env } from '@/config/env';
import { getWdkForBNB } from '@/lib/wdk-loader';

let wdkPromise: Promise<any> | null = null;

async function getWdk() {
  if (!wdkPromise) {
    wdkPromise = getWdkForBNB();
  }
  return wdkPromise;
}

const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
const signer = env.PRIVATE_KEY 
  ? new ethers.Wallet(env.PRIVATE_KEY, provider) 
  : ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, provider);

const policyGuard = getPolicyGuard();
policyGuard.addToWhitelist(signer.address);
if (env.WDK_VAULT_ADDRESS) policyGuard.addToWhitelist(env.WDK_VAULT_ADDRESS);
if (env.WDK_ENGINE_ADDRESS) policyGuard.addToWhitelist(env.WDK_ENGINE_ADDRESS);
if (env.WDK_AAVE_ADAPTER_ADDRESS) policyGuard.addToWhitelist(env.WDK_AAVE_ADAPTER_ADDRESS);
if (env.WDK_LZ_ADAPTER_ADDRESS) policyGuard.addToWhitelist(env.WDK_LZ_ADAPTER_ADDRESS);

export const bnbTools: McpTool[] = [
  {
    name: 'bnb_createWallet',
    description: 'Create or retrieve a BNB Chain wallet address',
    inputSchema: {
      type: 'object',
      properties: {
        walletIndex: { type: 'number', description: 'Wallet index (0 for main, 1+ for sub-wallets)', default: 0 }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'BNB Chain wallet address' },
        network: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'bnb_getBalance',
    description: 'Get native BNB and USDT token balance for a BNB Chain address',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'BNB Chain address (optional, defaults to main wallet)' },
        tokenAddress: { type: 'string', description: 'Token contract address (optional, defaults to USDT)' }
      },
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {
        nativeBalance: { type: 'string', description: 'Native BNB balance in ETH units' },
        nativeBalanceWei: { type: 'string', description: 'Native BNB balance in wei' },
        tokenBalance: { type: 'string', description: 'Token balance in token units' },
        tokenBalanceWei: { type: 'string', description: 'Token balance in wei' },
        symbol: { type: 'string', description: 'Token symbol' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'low',
    category: 'wallet'
  },
  {
    name: 'bnb_transfer',
    description: 'Transfer native BNB or BEP-20 tokens on BNB Chain',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient BNB Chain address' },
        amount: { type: 'string', description: 'Amount to transfer in token units (e.g., "0.1" for BNB or "100" for USDT)' },
        tokenAddress: { type: 'string', description: 'Token contract address (optional, omit for native BNB)' },
        tokenDecimals: { type: 'number', description: 'Token decimals (optional, default: 18 for BNB, 6 for USDT)', default: 18 }
      },
      required: ['to', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction hash' },
        blockNumber: { type: 'number', description: 'Block number where transaction was included' },
        gasUsed: { type: 'string', description: 'Gas used for transaction' },
        status: { type: 'string', description: 'Transaction status' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'high',
    category: 'wallet'
  },
  {
    name: 'bnb_swap',
    description: 'Swap tokens on PancakeSwap V3 DEX on BNB Chain',
    inputSchema: {
      type: 'object',
      properties: {
        amountIn: { type: 'string', description: 'Input amount in token units' },
        tokenIn: { type: 'string', description: 'Input token address (e.g., USDT)' },
        tokenOut: { type: 'string', description: 'Output token address (e.g., BNB)' },
        slippageBps: { type: 'number', description: 'Maximum slippage in basis points', default: 50 }
      },
      required: ['amountIn', 'tokenIn', 'tokenOut']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction hash' },
        amountOut: { type: 'string', description: 'Actual output amount' },
        priceImpact: { type: 'string', description: 'Price impact percentage' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'high',
    category: 'defi'
  },
  {
    name: 'bnb_supplyAave',
    description: 'Supply USDT to Aave V3 on BNB Chain to earn yield',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to supply in token units (e.g., "100")' }
      },
      required: ['amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction hash' },
        aTokenBalance: { type: 'string', description: 'New aToken balance' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'medium',
    category: 'lending'
  },
  {
    name: 'bnb_withdrawAave',
    description: 'Withdraw USDT from Aave V3 on BNB Chain back to wallet',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to withdraw in token units (e.g., "100")' }
      },
      required: ['amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction hash' },
        amountWithdrawn: { type: 'string', description: 'Amount withdrawn' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'medium',
    category: 'lending'
  },
  {
    name: 'bnb_bridgeLayerZero',
    description: 'Bridge USDT to another chain via LayerZero protocol',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount of USDT to bridge in token units' },
        dstEid: { type: 'number', description: 'Destination chain LayerZero Endpoint ID (1=Ethereum, 56=BNB, 42161=Arbitrum)' },
        recipientAddress: { type: 'string', description: 'Recipient address on destination chain (optional, defaults to sender)' }
      },
      required: ['amount', 'dstEid']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction hash' },
        dstEid: { type: 'number', description: 'Destination chain ID' },
        estimatedDestinationReceive: { type: 'string', description: 'Estimated amount received on destination' }
      }
    },
    version: '1.0.0',
    blockchain: 'bnb',
    riskLevel: 'high',
    category: 'bridge'
  }
];

export async function handleBnbTool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  const policyGuard = getPolicyGuard();
  
  try {
    switch (name) {
      case 'bnb_createWallet': {
        const walletIndex = (params.walletIndex as number) || 0;
        const wdk = await getWdk();
        const account = await wdk.getAccount('bnb', walletIndex);
        const address = await account.getAddress();
        return { success: true, data: { address, network: 'bnb' } };
      }

      case 'bnb_getBalance': {
        let targetAddress = params.address as string;
        if (!targetAddress) {
          try {
            const wdk = await getWdk();
            const account = await wdk.getAccount('bnb');
            targetAddress = await account.getAddress();
          } catch (e) {
            return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'No wallet address available. Provide address parameter.' } };
          }
        }
        
        const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
        
        const nativeBalance = await provider.getBalance(targetAddress);
        const nativeFormatted = ethers.formatEther(nativeBalance);
        
        let tokenData: { balance: string; formatted: string; symbol: string; error?: string } = { balance: '0', formatted: '0', symbol: 'USDT' };
        
        if (env.WDK_USDT_ADDRESS) {
          try {
            const tokenContract = new ethers.Contract(
              env.WDK_USDT_ADDRESS,
              ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function symbol() view returns (string)'],
              provider
            );
            const tokenBalance = await tokenContract.balanceOf(targetAddress);
            const decimals = await tokenContract.decimals();
            const symbol = await tokenContract.symbol();
            tokenData = {
              balance: tokenBalance.toString(),
              formatted: ethers.formatUnits(tokenBalance, decimals),
              symbol
            };
          } catch (tokenError) {
            tokenData = { balance: '0', formatted: '0', symbol: 'USDT', error: String(tokenError) };
          }
        }
        
        return { success: true, data: {
          nativeBalance: nativeFormatted,
          nativeBalanceWei: nativeBalance.toString(),
          tokenBalance: tokenData.formatted,
          tokenBalanceWei: tokenData.balance,
          symbol: tokenData.symbol
        }};
      }

      case 'bnb_transfer': {
        const to = params.to as string;
        const amount = params.amount as string;
        const tokenAddress = params.tokenAddress as string | undefined;
        const decimals = (params.tokenDecimals as number) || (tokenAddress ? 6 : 18);
        
        if (!to) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Recipient address is required' } };
        }
        if (!amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        }
        if (!ethers.isAddress(to)) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Invalid recipient address' } };
        }

        const policyViolation = policyGuard.validateTransaction({
          toAddress: to,
          amount: ethers.parseUnits(amount, decimals).toString(),
          currentRiskLevel: 'LOW',
          portfolioValue: '0'
        });

        if (policyViolation.violated) {
          return { success: false, error: { code: MCP_ERRORS.POLICY_VIOLATION, message: policyViolation.reason } };
        }

        const wdk = await getWdk();
        const account = await wdk.getAccount('bnb');
        
        if (tokenAddress && tokenAddress !== ethers.ZeroAddress) {
          const token = new ethers.Contract(
            tokenAddress,
            ['function transfer(address to, uint256 amount) returns (bool)'],
            signer
          );
          const tx = await token.transfer(to, ethers.parseUnits(amount, decimals));
          await tx.wait();
          return { success: true, data: { txHash: tx.hash, status: 'confirmed' } };
        } else {
          const tx = await signer.sendTransaction({
            to,
            value: ethers.parseEther(amount)
          });
          await tx.wait();
          return { success: true, data: { txHash: tx.hash, blockNumber: tx.blockNumber, gasUsed: tx.gasLimit.toString(), status: 'confirmed' } };
        }
      }

      case 'bnb_swap': {
        return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message: 'PancakeSwap integration requires additional configuration' } };
      }

      case 'bnb_supplyAave': {
        if (!env.WDK_AAVE_ADAPTER_ADDRESS) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Aave adapter not configured' } };
        }
        
        const amount = params.amount as string;
        if (!amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        }
        
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        const adapter = new ethers.Contract(
          env.WDK_AAVE_ADAPTER_ADDRESS,
          ['function onVaultDeposit(uint256 amount) external'],
          signer
        );
        
        const tx = await adapter.onVaultDeposit(usdtAmount);
        await tx.wait();
        
        policyGuard.recordTransaction(usdtAmount.toString());
        
        return { success: true, data: { txHash: tx.hash, action: 'AAVE_SUPPLY' } };
      }

      case 'bnb_withdrawAave': {
        if (!env.WDK_AAVE_ADAPTER_ADDRESS) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Aave adapter not configured' } };
        }
        
        const amount = params.amount as string;
        if (!amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Amount is required' } };
        }
        
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        const adapter = new ethers.Contract(
          env.WDK_AAVE_ADAPTER_ADDRESS,
          ['function withdrawToVault(uint256 amount) external returns (uint256)'],
          signer
        );
        
        const tx = await adapter.withdrawToVault(usdtAmount);
        await tx.wait();
        
        return { success: true, data: { txHash: tx.hash, amountWithdrawn: amount } };
      }

      case 'bnb_bridgeLayerZero': {
        if (!env.WDK_LZ_ADAPTER_ADDRESS) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'LayerZero adapter not configured' } };
        }
        
        const amount = params.amount as string;
        const dstEid = params.dstEid as number;
        const usdtAmount = ethers.parseUnits(amount, 6);
        
        const lzAdapter = new ethers.Contract(
          env.WDK_LZ_ADAPTER_ADDRESS,
          ['function bridge(uint32 dstEid, uint256 amount, bytes calldata options) external payable'],
          signer
        );
        
        const options = '0x00030100110100000000000000000000000000030d40';
        const tx = await lzAdapter.bridge(dstEid, usdtAmount, options, { value: ethers.parseEther('0.01') });
        await tx.wait();
        
        policyGuard.recordTransaction(usdtAmount.toString());
        
        return { success: true, data: { txHash: tx.hash, dstEid, estimatedDestinationReceive: amount } };
      }

      default:
        return { success: false, error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: `Tool ${name} not implemented` } };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message } };
  }
}
