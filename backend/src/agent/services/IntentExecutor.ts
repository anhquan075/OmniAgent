import { logger } from '@/utils/logger';
import { IntentResult } from './NLCommandParser';

export interface ExecutionResult {
  success: boolean;
  action: string;
  data?: Record<string, any>;
  error?: string;
  txHash?: string;
}

export interface MCPClient {
  call(method: string, params: Record<string, any>): Promise<any>;
}

export class IntentExecutor {
  constructor(
    private mcpClient: MCPClient,
    private walletAddress: string
  ) {}

  async execute(intent: IntentResult): Promise<ExecutionResult> {
    logger.info({ type: intent.type, action: intent.action }, '[IntentExecutor] Executing intent');

    switch (intent.type) {
      case 'HEDGE':
        return await this.executeHedge(intent);
      case 'YIELD':
        return await this.executeYield(intent);
      case 'TRANSFER':
        return await this.executeTransfer(intent);
      case 'QUERY':
        return await this.executeQuery(intent);
      case 'COMMAND':
        return await this.executeCommand(intent);
      default:
        return {
          success: false,
          action: 'unknown',
          error: `Unknown intent type: ${intent.type}`
        };
    }
  }

  private async executeHedge(intent: IntentResult): Promise<ExecutionResult> {
    switch (intent.action) {
      case 'move_to_stablecoin':
        try {
          const balance = await this.mcpClient.call('sepolia_getBalance', {
            walletAddress: this.walletAddress
          });

          if (balance.eth > 0.001) {
            const swapResult = await this.mcpClient.call('wdk_swap_tokens', {
              from: 'ETH',
              to: 'USDT',
              amount: intent.params.scope === 'all' ? 'max' : intent.params.amount,
              walletAddress: this.walletAddress
            });
            return {
              success: true,
              action: 'move_to_stablecoin',
              data: { swapped: swapResult },
              txHash: swapResult.txHash
            };
          }

          return {
            success: true,
            action: 'move_to_stablecoin',
            data: { message: 'No significant ETH to swap. Funds already in stablecoins?' }
          };
        } catch (error) {
          return { success: false, action: 'move_to_stablecoin', error: String(error) };
        }

      case 'move_to_gold':
        try {
          const swapResult = await this.mcpClient.call('wdk_swap_tokens', {
            from: 'USDT',
            to: 'XAUT',
            amount: intent.params.scope === 'all' ? 'max' : intent.params.amount,
            walletAddress: this.walletAddress
          });
          return {
            success: true,
            action: 'move_to_gold',
            data: { swapped: swapResult },
            txHash: swapResult.txHash
          };
        } catch (error) {
          return { success: false, action: 'move_to_gold', error: String(error) };
        }

      default:
        return { success: false, action: intent.action, error: 'Unknown hedge action' };
    }
  }

  private async executeYield(intent: IntentResult): Promise<ExecutionResult> {
    switch (intent.action) {
      case 'supply_to_aave':
        try {
          const supplyResult = await this.mcpClient.call('wdk_aave_supply', {
            asset: intent.params.asset || 'USDT',
            amount: intent.params.amount || 'max',
            walletAddress: this.walletAddress
          });
          return {
            success: true,
            action: 'supply_to_aave',
            data: supplyResult,
            txHash: supplyResult.txHash
          };
        } catch (error) {
          return { success: false, action: 'supply_to_aave', error: String(error) };
        }

      case 'optimize_yield':
        try {
          const cycleResult = await this.mcpClient.call('wdk_engine_executeCycle', {});
          return {
            success: true,
            action: 'optimize_yield',
            data: cycleResult
          };
        } catch (error) {
          return { success: false, action: 'optimize_yield', error: String(error) };
        }

      default:
        return { success: false, action: intent.action, error: 'Unknown yield action' };
    }
  }

  private async executeTransfer(intent: IntentResult): Promise<ExecutionResult> {
    switch (intent.action) {
      case 'transfer_usdt':
        if (!intent.params.recipient) {
          return { success: false, action: 'transfer_usdt', error: 'Recipient address required' };
        }
        try {
          const transferResult = await this.mcpClient.call('sepolia_transfer', {
            to: intent.params.recipient,
            amount: intent.params.amount || '10',
            token: 'USDT',
            walletAddress: this.walletAddress
          });
          return {
            success: true,
            action: 'transfer_usdt',
            data: transferResult,
            txHash: transferResult.txHash
          };
        } catch (error) {
          return { success: false, action: 'transfer_usdt', error: String(error) };
        }

      case 'bridge':
        try {
          const bridgeResult = await this.mcpClient.call('wdk_bridge', {
            fromChain: 'sepolia',
            toChain: intent.params.chain?.toLowerCase() || 'arbitrum',
            walletAddress: this.walletAddress
          });
          return {
            success: true,
            action: 'bridge',
            data: bridgeResult,
            txHash: bridgeResult.txHash
          };
        } catch (error) {
          return { success: false, action: 'bridge', error: String(error) };
        }

      default:
        return { success: false, action: intent.action, error: 'Unknown transfer action' };
    }
  }

  private async executeQuery(intent: IntentResult): Promise<ExecutionResult> {
    switch (intent.action) {
      case 'get_balance':
        try {
          const balance = await this.mcpClient.call('sepolia_getBalance', {
            walletAddress: this.walletAddress
          });
          return {
            success: true,
            action: 'get_balance',
            data: balance
          };
        } catch (error) {
          return { success: false, action: 'get_balance', error: String(error) };
        }

      case 'get_yield_info':
      case 'get_risk_metrics':
        try {
          const metrics = await this.mcpClient.call('wdk_engine_getRiskMetrics', {});
          return {
            success: true,
            action: intent.action,
            data: metrics
          };
        } catch (error) {
          return { success: false, action: intent.action, error: String(error) };
        }

      case 'get_portfolio':
        try {
          const portfolio = await this.mcpClient.call('wdk_getPortfolio', {
            walletAddress: this.walletAddress
          });
          return {
            success: true,
            action: 'get_portfolio',
            data: portfolio
          };
        } catch (error) {
          return { success: false, action: 'get_portfolio', error: String(error) };
        }

      default:
        return { success: true, action: intent.action, data: { message: 'Query processed' } };
    }
  }

  private async executeCommand(intent: IntentResult): Promise<ExecutionResult> {
    try {
      const result = await this.mcpClient.call(intent.action, {
        ...intent.params,
        walletAddress: this.walletAddress
      });
      return {
        success: true,
        action: intent.action,
        data: result,
        txHash: result?.txHash
      };
    } catch (error) {
      return { success: false, action: intent.action, error: String(error) };
    }
  }
}
