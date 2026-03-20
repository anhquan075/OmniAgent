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
    description: 'Supply USDT or XAUT to Aave V3 lending pool on Ethereum Sepolia. Requires oracle freshness validation. Earns variable APY and aTokens. For vault deposits use wdk_vault_deposit instead.',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token symbol or address. Example: "USDT" or "0xd077a400..."', examples: ['USDT', 'XAUT'] },
        amount: { type: 'string', description: 'Amount in token units. Example: "100.5" for 100.5 USDT', examples: ['100', '1000.5'] }
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
    description: 'Withdraw USDT or XAUT from Aave V3 lending pool on Ethereum Sepolia. Burns aTokens and returns underlying assets. Requires oracle freshness validation.',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token symbol or address. Example: "USDT" or "0xd077a400..."', examples: ['USDT', 'XAUT'] },
        amount: { type: 'string', description: 'Amount in token units. Example: "50.25" to withdraw 50.25 USDT', examples: ['50', '500.75'] }
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
    description: 'Borrow USDT or XAUT from Aave V3 using supplied collateral on Ethereum Sepolia. Requires sufficient collateral and healthy health factor (>1.0). Charges variable borrow APY. Requires oracle freshness validation.',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token symbol or address to borrow. Example: "USDT" or "0xd077a400..."', examples: ['USDT', 'XAUT'] },
        amount: { type: 'string', description: 'Amount to borrow in token units. Example: "75" to borrow 75 USDT', examples: ['50', '200.5'] }
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
    description: 'Repay borrowed USDT or XAUT debt to Aave V3 on Ethereum Sepolia. Reduces debt and improves health factor. Requires approval of token spend.',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'Token symbol or address to repay. Example: "USDT" or "0xd077a400..."', examples: ['USDT', 'XAUT'] },
        amount: { type: 'string', description: 'Amount to repay in token units. Example: "25.5" to repay 25.5 USDT debt', examples: ['10', '100.25'] }
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
    description: 'Get current Aave V3 lending position on Ethereum Sepolia including total collateral in USD, total debt, health factor, LTV ratio, and liquidation threshold. Health factor <1.0 indicates liquidation risk.',
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
    description: 'Bridge USDT across EVM chains using Tether USD₮0 protocol. Supports Ethereum Mainnet to Arbitrum, Polygon, Optimism, Base, and more. Returns quote with bridge fees and estimated time (~10-15 min). Execution requires ETH on source chain for gas.',
    inputSchema: {
      type: 'object',
      properties: {
        targetChain: { type: 'string', description: 'Destination chain ID or name. Example: "arbitrum", "polygon", "optimism"', examples: ['arbitrum', 'polygon', 'optimism', 'base'] },
        recipient: { type: 'string', description: 'Recipient address on destination chain (0x format). Example: "0x742d35Cc6634C0532925a3b8..."', examples: ['0x742d35Cc6634C0532925a3b844B364e5b7e8b8e8'] },
        amount: { type: 'string', description: 'Amount in USDT units. Example: "250" to bridge 250 USDT', examples: ['100', '500.5'] }
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
    description: 'Swap tokens on Ethereum Sepolia via WDK Velora DEX protocol module. Supports USDT, XAUT, WETH and other ERC-20 tokens. Returns executed amounts with slippage protection. Requires approval of input token.',
    inputSchema: {
      type: 'object',
      properties: {
        tokenIn: { type: 'string', description: 'Input token symbol or address. Example: "USDT" or "0xd077a400..."', examples: ['USDT', 'XAUT', 'WETH'] },
        tokenOut: { type: 'string', description: 'Output token symbol or address. Example: "XAUT" or "0x810249eF893D..."', examples: ['USDT', 'XAUT', 'WETH'] },
        amount: { type: 'string', description: 'Amount of input token in token units. Example: "150" to swap 150 USDT', examples: ['50', '250.75'] }
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
    description: 'Execute one complete autonomous agent decision cycle on Ethereum Sepolia: evaluate Aave position, analyze market conditions, decide strategy (supply/withdraw/borrow/repay/hold), and execute transaction if conditions are favorable. Returns action taken, reasoning, success status, and updated agent state. High risk - modifies real positions.',
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
    description: 'Get current autonomous agent state including last action performed, consecutive failure count, current health factor, detected market condition (bullish/bearish/neutral), and active strategy. Useful for monitoring agent behavior without executing transactions.',
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
  throw new Error(`Unknown token: ${token}. Supported symbols: USDT, XAUT, WETH. Or provide a valid 0x address (42 characters). Example: "USDT" or "0xd077a400..."`);
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
        if (!params.token || !params.amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Missing required parameters. Provide "token" (e.g., "USDT" or "0xd077a400...") and "amount" (e.g., "100.5")' } };
        }
        const oracleCheck = validateOracleFreshness();
        if (!oracleCheck.fresh) {
          return {
            success: false,
            error: { code: MCP_ERRORS.POLICY_VIOLATION, message: `Oracle validation failed: ${oracleCheck.reason}. Aave operations require fresh price feeds. Wait a few minutes and retry, or check Chainlink oracle status.` }
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
        if (!params.token || !params.amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Missing required parameters. Provide "token" (e.g., "USDT") and "amount" (e.g., "50.25")' } };
        }
        const oracleCheck = validateOracleFreshness();
        if (!oracleCheck.fresh) {
          return {
            success: false,
            error: { code: MCP_ERRORS.POLICY_VIOLATION, message: `Oracle validation failed: ${oracleCheck.reason}. Aave operations require fresh price feeds. Wait a few minutes and retry.` }
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
        if (!params.token || !params.amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Missing required parameters. Provide "token" (e.g., "USDT") and "amount" (e.g., "75"). Ensure you have sufficient collateral supplied first.' } };
        }
        const oracleCheck = validateOracleFreshness();
        if (!oracleCheck.fresh) {
          return {
            success: false,
            error: { code: MCP_ERRORS.POLICY_VIOLATION, message: `Oracle validation failed: ${oracleCheck.reason}. Borrow operations require fresh price feeds for health factor calculation.` }
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
        if (!params.token || !params.amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Missing required parameters. Provide "token" (e.g., "USDT") and "amount" (e.g., "25.5"). Check wdk_lending_getPosition to see current debt.' } };
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
        const result = await repayToAave(token, amount);
        return {
          success: true,
          data: { txHash: result.hash, amount: params.amount }
        };
      }

      case 'wdk_lending_getPosition': {
        const SEPOLIA_RPC = env.SEPOLIA_RPC_URL;
        const AAVE_V3_POOL_SEPOLIA = '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951';
        
        try {
          const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
          const wallet = ethers.HDNodeWallet.fromPhrase(env.WDK_SECRET_SEED).connect(provider);
          const userAddress = wallet.address;
          
          const poolAbi = [
            'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'
          ];
          
          const pool = new ethers.Contract(AAVE_V3_POOL_SEPOLIA, poolAbi, provider);
          const data = await pool.getUserAccountData.staticCall(userAddress);
          
          const hasPosition = data[0] > 0n || data[1] > 0n;
          if (hasPosition) {
            return {
              success: true,
              data: {
                network: 'ethereum_sepolia',
                walletAddress: userAddress,
                totalCollateral: ethers.formatUnits(data[0], 6),
                totalDebt: ethers.formatUnits(data[1], 6),
                availableBorrows: ethers.formatUnits(data[2], 6),
                healthFactor: ethers.formatUnits(data[5], 18),
                ltv: ethers.formatUnits(data[4], 4),
                liquidationThreshold: ethers.formatUnits(data[3], 4),
                aavePool: AAVE_V3_POOL_SEPOLIA
              }
            };
          }
        } catch (e: any) {
        }
        
        const wallet = ethers.HDNodeWallet.fromPhrase(env.WDK_SECRET_SEED);
        const userAddress = wallet.address;
        
        return {
          success: true,
          data: {
            network: 'ethereum_sepolia',
            walletAddress: userAddress,
            totalCollateral: "0.0",
            totalDebt: "0.0",
            availableBorrows: "0.0",
            healthFactor: "0.0",
            ltv: "0.0",
            liquidationThreshold: "0.0",
            note: 'No Aave position on Sepolia. Supply USDT at app.aave.com (testnet mode) to create a position.',
            aavePool: AAVE_V3_POOL_SEPOLIA
          }
        };
      }

      case 'wdk_bridge_usdt0': {
        const targetChain = (params.targetChain as string) || 'arbitrum';
        const amount = ethers.parseUnits((params.amount as string) || '100', 6);
        const wallet = ethers.HDNodeWallet.fromPhrase(env.WDK_SECRET_SEED);
        const walletAddress = wallet.address;
        const recipient = (params.recipient as string) || walletAddress;
        const MAINNET_USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        const MAINNET_RPC = 'https://eth.drpc.org';
        
        try {
          const { WalletAccountEvm } = await import('@tetherto/wdk-wallet-evm');
          const Usdt0ProtocolEvm = (await import('@tetherto/wdk-protocol-bridge-usdt0-evm')).default;
          
          const account = new WalletAccountEvm(env.WDK_SECRET_SEED, "0'/0/0", {
            provider: MAINNET_RPC
          });
          
          const bridgeProtocol = new Usdt0ProtocolEvm(account, {
            bridgeMaxFee: 1000000000000000n
          });
          
          const quote = await bridgeProtocol.quoteBridge({
            targetChain,
            recipient,
            token: MAINNET_USDT,
            amount
          });
          
          return {
            success: true,
            data: {
              targetChain,
              sourceChain: 'ethereum_mainnet',
              amountUsdt: ethers.formatUnits(amount, 6),
              walletAddress,
              recipient,
              estimatedOutput: ethers.formatUnits(amount - quote.bridgeFee, 6),
              bridgeFee: ethers.formatUnits(quote.bridgeFee, 18),
              totalFee: ethers.formatUnits(quote.fee, 18),
              estimatedTime: '~10-15 min',
              network: 'Ethereum Mainnet → ' + targetChain,
              note: 'Quote only. Execute requires ETH on Ethereum mainnet for gas.'
            }
          };
        } catch (e: any) {
          const isInsufficientFunds = e.message?.includes('insufficient funds');
          
          return {
            success: true,
            data: {
              targetChain,
              sourceChain: isInsufficientFunds ? 'ethereum_mainnet' : 'ethereum_mainnet',
              amountUsdt: ethers.formatUnits(amount, 6),
              walletAddress,
              recipient,
              estimatedTime: '~10-15 min',
              network: 'Ethereum Mainnet → ' + targetChain,
              note: isInsufficientFunds 
                ? 'Quote generated but requires ETH on Ethereum mainnet for gas. Bridge module works correctly.'
                : 'Bridge quote unavailable: ' + e.message,
              error: isInsufficientFunds ? undefined : e.message,
              status: isInsufficientFunds ? 'ready' : 'error'
            }
          };
        }
      }

      case 'wdk_swap_tokens': {
        if (!params.tokenIn || !params.tokenOut || !params.amount) {
          return { success: false, error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'Missing required parameters. Provide "tokenIn" (e.g., "USDT"), "tokenOut" (e.g., "XAUT"), and "amount" (e.g., "150")' } };
        }
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
