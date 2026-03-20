/**
 * MarketScanner Types
 * Defines the data structures for real-time market data aggregation
 */

export interface PricePoint {
  exchange: string;
  pair: string;
  price: number;
  bid?: number;
  ask?: number;
  spread: number;
  volume24h: number;
  timestamp: number;
}

export interface ExchangeFee {
  maker: number;
  taker: number;
}

export interface ExchangeConfig {
  name: string;
  type: 'CEX' | 'DEX';
  fees: ExchangeFee;
  baseUrl?: string;
}

export interface PriceMatrix {
  timestamp: number;
  gasPriceGwei: number;
  ethPriceUsd: number;
  pairs: {
    [pair: string]: {
      [exchange: string]: PricePoint;
    };
  };
  bestOpportunity: ArbitrageOpportunity | null;
}

export interface ArbitrageOpportunity {
  id: string;
  buyExchange: string;
  sellExchange: string;
  pair: string;
  buyPrice: number;
  sellPrice: number;
  spreadPercent: number;
  spreadAfterFees: number;
  estimatedProfit: number;
  estimatedGas: number;
  netProfitUsd: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  timestamp: number;
}

export interface MarketScannerConfig {
  scanIntervalMs: number;
  pairs: string[];
  exchanges: ExchangeConfig[];
  minSpreadThreshold: number;
  maxGasPriceGwei: number;
}

export const DEFAULT_EXCHANGES: ExchangeConfig[] = [
  { name: 'binance', type: 'CEX', fees: { maker: 0.001, taker: 0.001 } },
  { name: 'bybit', type: 'CEX', fees: { maker: 0.001, taker: 0.001 } },
  { name: 'okx', type: 'CEX', fees: { maker: 0.0008, taker: 0.001 } },
  { name: 'uniswap', type: 'DEX', fees: { maker: 0, taker: 0.003 } },
  { name: 'curve', type: 'DEX', fees: { maker: 0, taker: 0.0004 } },
  { name: 'pancakeswap', type: 'DEX', fees: { maker: 0, taker: 0.0025 } },
];

export const DEFAULT_PAIRS = [
  'USDT/USDC',
  'USDT/DAI',
  'USDT/PYUSD',
];