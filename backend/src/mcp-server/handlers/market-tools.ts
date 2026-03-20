import { ethers } from 'ethers';
import { env } from '../../config/env';
import { createMarketScanner, MarketScanner } from '../../services/market-scanner';
import { calculateProfit, ProfitCalcParams } from '../../services/market-scanner/ProfitCalculator';
import { McpTool, MCP_ERRORS } from '../types/mcp-protocol';

let scannerInstance: MarketScanner | null = null;

function getProvider(): ethers.Provider {
  return new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
}

function getScanner(): MarketScanner {
  if (!scannerInstance) {
    scannerInstance = createMarketScanner(env.SEPOLIA_RPC_URL, {
      scanIntervalMs: 5000,
      minSpreadThreshold: 0.1,
    });
  }
  return scannerInstance;
}

const feeMap: Record<string, number> = {
  binance: 10,
  bybit: 10,
  okx: 8,
  uniswap: 30,
  curve: 4,
  pancakeswap: 25,
};

export const marketTools: McpTool[] = [
  {
    name: 'market_get_price_matrix',
    description: 'Get real-time price matrix for stablecoin pairs across CEX/DEX exchanges (Binance, Bybit, OKX, Uniswap, Curve, PancakeSwap)',
    inputSchema: {
      type: 'object',
      properties: {
        pairs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Trading pairs to scan. Example: ["USDT/USDC", "DAI/USDC"]',
        },
      },
    },
    outputSchema: { type: 'object', properties: { timestamp: { type: 'number' }, gasPriceGwei: { type: 'number' }, ethPriceUsd: { type: 'number' }, pairs: { type: 'array' }, bestOpportunity: { type: 'object' } } },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'defi',
  },
  {
    name: 'market_get_best_opportunity',
    description: 'Find the best arbitrage opportunity across monitored exchanges with minimum spread threshold',
    inputSchema: {
      type: 'object',
      properties: {
        minSpreadBps: {
          type: 'number',
          description: 'Minimum spread threshold in basis points (100 bps = 1%). Example: 15',
          default: 15,
          examples: ["15", "20", "50"],
        },
      },
    },
    outputSchema: { type: 'object', properties: { found: { type: 'boolean' }, opportunity: { type: 'object' }, reason: { type: 'string' } } },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'defi',
  },
  {
    name: 'market_calculate_profit',
    description: 'Calculate profit breakdown for a potential arbitrage trade including gas costs and exchange fees',
    inputSchema: {
      type: 'object',
      properties: {
        spreadBps: {
          type: 'number',
          description: 'Price spread in basis points (100 bps = 1%). Example: 25',
          examples: ["25", "50", "100"],
        },
        volumeUsd: {
          type: 'number',
          description: 'Trade volume in USD. Example: "1000" or "5000"',
          default: 1000,
          examples: ["1000", "5000", "10000"],
        },
        buyExchange: {
          type: 'string',
          description: 'Exchange to buy from. Available: binance, bybit, okx, uniswap, curve, pancakeswap. Example: "binance"',
          examples: ["binance", "uniswap", "okx"],
        },
        sellExchange: {
          type: 'string',
          description: 'Exchange to sell to. Available: binance, bybit, okx, uniswap, curve, pancakeswap. Example: "uniswap"',
          examples: ["uniswap", "bybit", "curve"],
        },
      },
      required: ['spreadBps'],
    },
    outputSchema: { type: 'object', properties: { input: { type: 'object' }, analysis: { type: 'object' } } },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'defi',
  },
  {
    name: 'market_start_scanner',
    description: 'Start continuous market price monitoring service with 5-second interval',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { message: { type: 'string' }, intervalMs: { type: 'number' } } },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'utility',
  },
  {
    name: 'market_stop_scanner',
    description: 'Stop the market price monitoring service',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: { message: { type: 'string' } } },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'utility',
  },
];

export async function handleMarketTool(
  name: string,
  params: Record<string, unknown>,
  context: { userWallet?: string; walletMode?: string }
): Promise<{ success: boolean; data?: unknown; error?: { code: number; message: string } }> {
  switch (name) {
    case 'market_get_price_matrix': {
      const scanner = getScanner();
      const matrix = await scanner.scan();
      return {
        success: true,
        data: {
          timestamp: matrix.timestamp,
          gasPriceGwei: matrix.gasPriceGwei,
          ethPriceUsd: matrix.ethPriceUsd,
          pairs: matrix.pairs,
          bestOpportunity: matrix.bestOpportunity,
          _meta: { executedBy: context.userWallet ? 'user' : 'agent_wallet', userWallet: context.userWallet ?? null },
        },
      };
    }

    case 'market_get_best_opportunity': {
      const scanner = getScanner();
      const matrix = await scanner.scan();
      if (!matrix.bestOpportunity) {
        return {
          success: true,
          data: { found: false, reason: 'No profitable opportunity', gasPriceGwei: matrix.gasPriceGwei },
        };
      }
      const opp = matrix.bestOpportunity;
      return {
        success: true,
        data: {
          found: true,
          opportunity: {
            id: opp.id,
            pair: opp.pair,
            buyExchange: opp.buyExchange,
            sellExchange: opp.sellExchange,
            spreadPercent: opp.spreadPercent.toFixed(3),
            netProfitUsd: opp.netProfitUsd.toFixed(2),
          },
        },
      };
    }

    case 'market_calculate_profit': {
      if (!params.spreadBps) {
        return {
          success: false,
          error: { code: MCP_ERRORS.INVALID_PARAMS, message: 'spreadBps is required. Example: spreadBps: 25 (for 0.25% spread)' }
        };
      }
      const spreadBps = (params.spreadBps as number) ?? 0;
      const volumeUsd = (params.volumeUsd as number) ?? 1000;
      const buyExchange = (params.buyExchange as string) ?? 'binance';
      const sellExchange = (params.sellExchange as string) ?? 'uniswap';

      let gasPriceGwei = 0.96;
      try {
        const feeData = await getProvider().getFeeData();
        gasPriceGwei = Number(ethers.formatUnits(feeData.gasPrice ?? 0n, 'gwei'));
      } catch {}

      const calcParams: ProfitCalcParams = {
        spreadBps,
        volumeUsd,
        gasEstimate: 150000,
        gasPriceGwei,
        ethPriceUsd: 3500,
        buyFeeBps: feeMap[buyExchange] ?? 10,
        sellFeeBps: feeMap[sellExchange] ?? 10,
      };

      const analysis = calculateProfit(calcParams);
      return {
        success: true,
        data: {
          input: { spreadBps, volumeUsd, buyExchange, sellExchange },
          analysis: {
            grossProfitUsd: analysis.grossProfitUsd.toFixed(2),
            gasCostUsd: analysis.gasCostUsd.toFixed(2),
            netProfitUsd: analysis.netProfitUsd.toFixed(2),
            isProfitable: analysis.isProfitable,
            recommendation: analysis.recommendation,
          },
        },
      };
    }

    case 'market_start_scanner': {
      getScanner().start(() => {});
      return { success: true, data: { message: 'Scanner started', intervalMs: 5000 } };
    }

    case 'market_stop_scanner': {
      scannerInstance?.stop();
      return { success: true, data: { message: 'Scanner stopped' } };
    }

    default:
      return { success: false, error: { code: -32601, message: `Unknown tool: ${name}` } };
  }
}