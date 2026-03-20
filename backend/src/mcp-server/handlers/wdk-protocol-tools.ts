import { McpTool, McpExecutionContext, MCP_ERRORS } from '../types/mcp-protocol';
import { ethers } from 'ethers';
import { env } from '@/config/env';
import {
  supplyToAave,
  withdrawFromAave,
  borrowFromAave,
  repayToAave,
  getAaveAccountData,
  bridgeUsdt0,
  quoteBridgeUsdt0,
  swapTokens,
  quoteSwapTokens,
  TOKEN_ADDRESSES,
  validateOracleFreshness
} from '@/services/WdkProtocolService';
import { runAutonomousCycle, getAgentState, resetAgentState } from '@/services/AutonomousAgent';
import { createPendingTransactionId, storePendingTransaction, encodeTransactionData, createUnsignedTransaction } from '@/lib/user-wallet-signer';

export const wdkProtocolTools: McpTool[] = [
  {
    name: 'wdk_lending_supply',
    description: 'Supply tokens to Aave lending pool via WDK protocol module',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token address (or USDT/XAUT)' },
        amount: { type: 'string', description: 'Amount in human-readable units' }
      },
      required: ['token', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        amount: { type: 'string' },
        approveHash: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'lending'
  },
  {
    name: 'wdk_lending_withdraw',
    description: 'Withdraw tokens from Aave lending pool via WDK protocol module',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token address' },
        amount: { type: 'string', description: 'Amount in human-readable units' }
      },
      required: ['token', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        amount: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'lending'
  },
  {
    name: 'wdk_lending_borrow',
    description: 'Borrow tokens from Aave lending pool via WDK protocol module',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token address' },
        amount: { type: 'string', description: 'Amount in human-readable units' }
      },
      required: ['token', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        amount: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'high',
    category: 'lending'
  },
  {
    name: 'wdk_lending_repay',
    description: 'Repay borrowed tokens to Aave via WDK protocol module',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token address' },
        amount: { type: 'string', description: 'Amount in human-readable units' }
      },
      required: ['token', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        amount: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'lending'
  },
  {
    name: 'wdk_lending_getPosition',
    description: 'Get current Aave lending position via WDK protocol module',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    outputSchema: {
      type: 'object',
      properties: {
        totalCollateral: { type: 'string' },
        totalDebt: { type: 'string' },
        healthFactor: { type: 'string' },
        ltv: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'lending'
  },
  {
    name: 'wdk_bridge_usdt0',
    description: 'Bridge USD₮ to another chain via WDK USD₮0 protocol module',
    inputSchema: {
      type: 'object',
      properties: {
        targetChain: { type: 'string', description: 'Destination chain (arbitrum, polygon, etc.)' },
        recipient: { type: 'string', description: 'Recipient address on destination chain' },
        amount: { type: 'string', description: 'Amount in human-readable units' }
      },
      required: ['targetChain', 'recipient', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        bridgeFee: { type: 'string' },
        targetChain: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'bridge'
  },
  {
    name: 'wdk_swap_tokens',
    description: 'Swap tokens via WDK Velora protocol module',
    inputSchema: {
      type: 'object',
      properties: {
        tokenIn: { type: 'string', description: 'Input token address or symbol (USDT, XAUT, WETH)' },
        tokenOut: { type: 'string', description: 'Output token address or symbol' },
        amount: { type: 'string', description: 'Amount in human-readable units' }
      },
      required: ['tokenIn', 'tokenOut', 'amount']
    },
    outputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string' },
        tokenInAmount: { type: 'string' },
        tokenOutAmount: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'medium',
    category: 'defi'
  },
  {
    name: 'wdk_autonomous_cycle',
    description: 'Run one autonomous agent cycle - evaluate market, decide strategy, execute',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    outputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string' },
        reason: { type: 'string' },
        success: { type: 'boolean' },
        state: { type: 'object' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'high',
    category: 'defi'
  },
  {
    name: 'wdk_autonomous_status',
    description: 'Get current autonomous agent state and last decision',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    outputSchema: {
      type: 'object',
      properties: {
        lastAction: { type: 'string' },
        consecutiveFailures: { type: 'number' },
        healthFactor: { type: 'string' },
        marketCondition: { type: 'string' }
      }
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'utility'
  }
];

function resolveTokenAddress(token: string): string {
  const upper = token.toUpperCase();
  if (TOKEN_ADDRESSES.mainnet[upper]) {
    return TOKEN_ADDRESSES.mainnet[upper];
  }
  if (token.startsWith('0x') && token.length === 42) {
    return token;
  }
  throw new Error(`Unknown token: ${token}. Use USDT, XAUT, WETH, or a valid address.`);
}

function parseTokenAmount(amount: string, token: string): bigint {
  const upper = token.toUpperCase();
  if (upper === 'XAUT') {
    return ethers.parseUnits(amount, 6);
  }
  if (upper === 'USDT' || token === TOKEN_ADDRESSES.mainnet.USDT) {
    return ethers.parseUnits(amount, 6);
  }
  return ethers.parseUnits(amount, 18);
}

async function getWdkWalletAddress(): Promise<string> {
  const WalletAccountEvm = (await import('@tetherto/wdk-wallet-evm')).WalletAccountEvm;
  const account = new WalletAccountEvm(env.WDK_SECRET_SEED, "0'/0/0", {
    provider: env.SEPOLIA_RPC_URL
  });
  return account.getAddress();
}

export async function handleWdkProtocolTool(
  name: string,
  params: Record<string, unknown>,
  context: McpExecutionContext
) {
  try {
    switch (name) {
      case 'wdk_lending_supply': {
        const oracleCheck = validateOracleFreshness();
        if (!oracleCheck.fresh) {
          return {
            success: false,
            error: { code: MCP_ERRORS.POLICY_VIOLATION, message: oracleCheck.reason }
          };
        }

        if (context.walletMode === 'user' && context.userWallet) {
          const walletAddress = await getWdkWalletAddress();
          const token = resolveTokenAddress(params.token as string);
          const amount = parseTokenAmount(params.amount as string, params.token as string);
          
          return {
            success: true,
            data: {
              requiresSignature: true,
              note: 'WDK Protocol tools use agent wallet for Aave interactions',
              executedBy: 'agent_wallet',
              agentWallet: walletAddress,
              amount: params.amount
            }
          };
        }

        const token = resolveTokenAddress(params.token as string);
        const amount = parseTokenAmount(params.amount as string, params.token as string);
        const result = await supplyToAave(token, amount);
        return {
          success: true,
          data: {
            txHash: result.hash,
            amount: params.amount,
            approveHash: result.approveHash
          }
        };
      }

      case 'wdk_lending_withdraw': {
        const oracleCheck = validateOracleFreshness();
        if (!oracleCheck.fresh) {
          return {
            success: false,
            error: { code: MCP_ERRORS.POLICY_VIOLATION, message: oracleCheck.reason }
          };
        }

        if (context.walletMode === 'user' && context.userWallet) {
          const walletAddress = await getWdkWalletAddress();
          return {
            success: true,
            data: {
              requiresSignature: true,
              note: 'WDK Protocol tools use agent wallet for Aave interactions',
              executedBy: 'agent_wallet',
              agentWallet: walletAddress,
              amount: params.amount
            }
          };
        }

        const token = resolveTokenAddress(params.token as string);
        const amount = parseTokenAmount(params.amount as string, params.token as string);
        const result = await withdrawFromAave(token, amount);
        return {
          success: true,
          data: { txHash: result.hash, amount: params.amount }
        };
      }

      case 'wdk_lending_borrow': {
        const oracleCheck = validateOracleFreshness();
        if (!oracleCheck.fresh) {
          return {
            success: false,
            error: { code: MCP_ERRORS.POLICY_VIOLATION, message: oracleCheck.reason }
          };
        }

        if (context.walletMode === 'user' && context.userWallet) {
          const walletAddress = await getWdkWalletAddress();
          return {
            success: true,
            data: {
              requiresSignature: true,
              note: 'WDK Protocol tools use agent wallet for Aave interactions',
              executedBy: 'agent_wallet',
              agentWallet: walletAddress,
              amount: params.amount
            }
          };
        }

        const token = resolveTokenAddress(params.token as string);
        const amount = parseTokenAmount(params.amount as string, params.token as string);
        const result = await borrowFromAave(token, amount);
        return {
          success: true,
          data: { txHash: result.hash, amount: params.amount }
        };
      }

      case 'wdk_lending_repay': {
        if (context.walletMode === 'user' && context.userWallet) {
          const walletAddress = await getWdkWalletAddress();
          return {
            success: true,
            data: {
              requiresSignature: true,
              note: 'WDK Protocol tools use agent wallet for Aave interactions',
              executedBy: 'agent_wallet',
              agentWallet: walletAddress,
              amount: params.amount
            }
          };
        }

        const token = resolveTokenAddress(params.token as string);
        const amount = parseTokenAmount(params.amount as string, params.token as string);
        const result = await repayToAave(token, amount);
        return {
          success: true,
          data: { txHash: result.hash, amount: params.amount }
        };
      }

      case 'wdk_lending_getPosition': {
        const data = await getAaveAccountData();
        return {
          success: true,
          data: {
            totalCollateral: ethers.formatUnits(data.totalCollateralBase, 8),
            totalDebt: ethers.formatUnits(data.totalDebtBase, 8),
            healthFactor: ethers.formatUnits(data.healthFactor, 18),
            ltv: ethers.formatUnits(data.ltv, 4)
          }
        };
      }

      case 'wdk_bridge_usdt0': {
        if (context.walletMode === 'user' && context.userWallet) {
          const walletAddress = await getWdkWalletAddress();
          return {
            success: true,
            data: {
              requiresSignature: true,
              note: 'WDK Protocol tools use agent wallet for bridge interactions',
              executedBy: 'agent_wallet',
              agentWallet: walletAddress,
              targetChain: params.targetChain
            }
          };
        }

        const targetChain = params.targetChain as string;
        const recipient = params.recipient as string;
        const amount = ethers.parseUnits(params.amount as string, 6);
        const result = await bridgeUsdt0(
          targetChain,
          recipient,
          TOKEN_ADDRESSES.mainnet.USDT,
          amount
        );
        return {
          success: true,
          data: {
            txHash: result.hash,
            bridgeFee: result.bridgeFee.toString(),
            targetChain
          }
        };
      }

      case 'wdk_swap_tokens': {
        if (context.walletMode === 'user' && context.userWallet) {
          const walletAddress = await getWdkWalletAddress();
          return {
            success: true,
            data: {
              requiresSignature: true,
              note: 'WDK Protocol tools use agent wallet for swap interactions',
              executedBy: 'agent_wallet',
              agentWallet: walletAddress,
              tokenIn: params.tokenIn,
              tokenOut: params.tokenOut
            }
          };
        }

        const tokenIn = resolveTokenAddress(params.tokenIn as string);
        const tokenOut = resolveTokenAddress(params.tokenOut as string);
        const amount = parseTokenAmount(params.amount as string, params.tokenIn as string);
        const result = await swapTokens(tokenIn, tokenOut, amount);
        return {
          success: true,
          data: {
            txHash: result.hash,
            tokenInAmount: result.tokenInAmount.toString(),
            tokenOutAmount: result.tokenOutAmount.toString()
          }
        };
      }

      case 'wdk_autonomous_cycle': {
        if (context.walletMode === 'user' && context.userWallet) {
          const walletAddress = await getWdkWalletAddress();
          return {
            success: true,
            data: {
              requiresSignature: true,
              note: 'Autonomous cycle uses agent wallet',
              executedBy: 'agent_wallet',
              agentWallet: walletAddress
            }
          };
        }

        const result = await runAutonomousCycle();
        return {
          success: true,
          data: {
            action: result.decision.action,
            reason: result.decision.reason,
            success: result.success,
            state: {
              lastAction: result.state.lastAction,
              consecutiveFailures: result.state.consecutiveFailures,
              healthFactor: result.state.healthFactor.toString(),
              marketCondition: result.state.marketCondition
            }
          }
        };
      }

      case 'wdk_autonomous_status': {
        const state = getAgentState();
        return {
          success: true,
          data: {
            lastAction: state.lastAction,
            lastActionTime: state.lastActionTime,
            consecutiveFailures: state.consecutiveFailures,
            totalSupplied: state.totalSuppliedUsdt.toString(),
            totalWithdrawn: state.totalWithdrawnUsdt.toString(),
            healthFactor: state.healthFactor.toString(),
            marketCondition: state.marketCondition,
            strategy: state.strategy
          }
        };
      }

      default:
        return { success: false, error: { code: MCP_ERRORS.TOOL_NOT_FOUND, message: `Tool ${name} not found` } };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: { code: MCP_ERRORS.TOOL_EXECUTION_FAILED, message } };
  }
}
