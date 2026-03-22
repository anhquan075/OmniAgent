import { ethers } from 'ethers';
import {
  PricePoint,
  PriceMatrix,
  ArbitrageOpportunity,
  MarketScannerConfig,
  ExchangeConfig,
  DEFAULT_EXCHANGES,
  DEFAULT_PAIRS,
} from './types';

let BitfinexPricingClient: any = null;

async function loadBitfinexClient() {
  if (!BitfinexPricingClient) {
    const mod = await import('@tetherto/wdk-pricing-bitfinex-http');
    BitfinexPricingClient = mod.BitfinexPricingClient;
  }
  return BitfinexPricingClient;
}

export class MarketScanner {
  private bitfinexClient: any = null;
  private provider: ethers.Provider;
  private config: MarketScannerConfig;
  private lastMatrix: PriceMatrix | null = null;
  private scanInterval: NodeJS.Timeout | null = null;

  constructor(
    rpcUrl: string,
    config?: Partial<MarketScannerConfig>
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.config = {
      scanIntervalMs: config?.scanIntervalMs ?? 2500,
      pairs: config?.pairs ?? DEFAULT_PAIRS,
      exchanges: config?.exchanges ?? DEFAULT_EXCHANGES,
      minSpreadThreshold: config?.minSpreadThreshold ?? 0.15,
      maxGasPriceGwei: config?.maxGasPriceGwei ?? 50,
    };
  }

  async getGasPrice(): Promise<number> {
    try {
      const feeData = await this.provider.getFeeData();
      return Number(ethers.formatUnits(feeData.gasPrice ?? 0n, 'gwei'));
    } catch {
      return 0.96;
    }
  }

  async fetchBinancePrices(): Promise<Map<string, PricePoint>> {
    const prices = new Map<string, PricePoint>();
    const binancePairs = ['USDCUSDT', 'DAIUSDT'];

    try {
      const responses = await Promise.all(
        binancePairs.map(pair =>
          fetch(`https://api.binance.com/api/v3/ticker/bookTicker?symbol=${pair}`)
            .then(r => r.json())
            .catch(() => null)
        )
      );

      responses.forEach((data, i) => {
        if (data?.bidPrice && data?.askPrice) {
          const pairName = binancePairs[i].replace('USDT', '/USDT').replace('USDC', 'USDC/').replace('DAI', 'DAI/');
          const bid = parseFloat(data.bidPrice);
          const ask = parseFloat(data.askPrice);
          const midPrice = (bid + ask) / 2;
          const spread = ((ask - bid) / midPrice) * 100;

          prices.set(pairName === 'USDC/USDT' ? 'USDT/USDC' : pairName, {
            exchange: 'binance',
            pair: pairName === 'USDC/USDT' ? 'USDT/USDC' : 'USDT/DAI',
            price: midPrice,
            bid,
            ask,
            spread,
            volume24h: 0,
            timestamp: Date.now(),
          });
        }
      });
    } catch (e) {
      console.error('[MarketScanner] Binance fetch error:', e);
    }

    return prices;
  }

  async fetchCoingeckoPrices(): Promise<Map<string, PricePoint>> {
    const prices = new Map<string, PricePoint>();
    const coingeckoIds = ['usd-coin', 'dai'];

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds.join(',')}&vs_currencies=usd`
      );
      const data = await response.json();

      if (data['usd-coin']) {
        prices.set('USDT/USDC', {
          exchange: 'coingecko',
          pair: 'USDT/USDC',
          price: data['usd-coin'].usd,
          spread: 0,
          volume24h: 0,
          timestamp: Date.now(),
        });
      }

      if (data['dai']) {
        prices.set('USDT/DAI', {
          exchange: 'coingecko',
          pair: 'USDT/DAI',
          price: data['dai'].usd,
          spread: 0,
          volume24h: 0,
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      console.error('[MarketScanner] Coingecko fetch error:', e);
    }

    return prices;
  }

  async fetchBitfinexPrices(): Promise<Map<string, PricePoint>> {
    const prices = new Map<string, PricePoint>();

    try {
      const Client = await loadBitfinexClient();
      this.bitfinexClient = this.bitfinexClient ?? new Client();

      const pairs = [
        { from: 'BTC', to: 'USD' },
        { from: 'ETH', to: 'USD' },
        { from: 'USDT', to: 'USD' },
        { from: 'XAUT', to: 'USD' },
      ];

      const priceDataList = await this.bitfinexClient.getMultiPriceData(pairs);

      for (let i = 0; i < pairs.length; i++) {
        const data = priceDataList[i];
        if (!data) continue;

        const pairName = `${pairs[i].from}/${pairs[i].to}`;
        prices.set(pairName, {
          exchange: 'bitfinex',
          pair: pairName,
          price: data.lastPrice,
          bid: data.lastPrice,
          ask: data.lastPrice,
          spread: 0,
          volume24h: 0,
          dailyChange: data.dailyChange,
          dailyChangePercent: data.dailyChangeRelative,
          timestamp: Date.now(),
        });
      }
    } catch (e) {
      console.error('[MarketScanner] Bitfinex fetch error:', e);
    }

    return prices;
  }

  calculateBestOpportunity(
    allPrices: Map<string, PricePoint>,
    gasPriceGwei: number
  ): ArbitrageOpportunity | null {
    let best: ArbitrageOpportunity | null = null;

    for (const [pair, buyPrice] of allPrices) {
      const pairPrices = Array.from(allPrices.values()).filter(p => p.pair === pair);
      
      for (const sellPrice of pairPrices) {
        if (sellPrice.exchange === buyPrice.exchange) continue;

        const exchangeBuy = this.config.exchanges.find(e => e.name === buyPrice.exchange);
        const exchangeSell = this.config.exchanges.find(e => e.name === sellPrice.exchange);
        
        if (!exchangeBuy || !exchangeSell) continue;

        const spreadPercent = ((sellPrice.price - buyPrice.price) / buyPrice.price) * 100;
        const spreadAfterFees = spreadPercent - (exchangeBuy.fees.taker + exchangeSell.fees.taker) * 100;

        if (spreadAfterFees < this.config.minSpreadThreshold) continue;

        const estimatedGas = 150000;
        const estimatedProfit = 1000 * (spreadAfterFees / 100);
        const netProfitUsd = estimatedProfit - (estimatedGas * gasPriceGwei * 0.000000001 * 3500);

        const confidence = spreadAfterFees > 0.3 ? 'HIGH' : spreadAfterFees > 0.2 ? 'MEDIUM' : 'LOW';

        if (!best || netProfitUsd > best.netProfitUsd) {
          best = {
            id: `${buyPrice.exchange}-${sellPrice.exchange}-${pair}-${Date.now()}`,
            buyExchange: buyPrice.exchange,
            sellExchange: sellPrice.exchange,
            pair,
            buyPrice: buyPrice.price,
            sellPrice: sellPrice.price,
            spreadPercent,
            spreadAfterFees,
            estimatedProfit,
            estimatedGas,
            netProfitUsd,
            confidence,
            timestamp: Date.now(),
          };
        }
      }
    }

    return best;
  }

  async scan(): Promise<PriceMatrix> {
    const [gasPriceGwei, binancePrices, coingeckoPrices, bitfinexPrices] = await Promise.all([
      this.getGasPrice(),
      this.fetchBinancePrices(),
      this.fetchCoingeckoPrices(),
      this.fetchBitfinexPrices(),
    ]);

    const allPrices = new Map([...binancePrices, ...coingeckoPrices, ...bitfinexPrices]);

    const pairs: PriceMatrix['pairs'] = {};
    for (const [pair, price] of allPrices) {
      if (!pairs[pair]) pairs[pair] = {};
      pairs[pair][price.exchange] = price;
    }

    const matrix: PriceMatrix = {
      timestamp: Date.now(),
      gasPriceGwei,
      ethPriceUsd: 3500,
      pairs,
      bestOpportunity: this.calculateBestOpportunity(allPrices, gasPriceGwei),
    };

    this.lastMatrix = matrix;
    return matrix;
  }

  start(callback: (matrix: PriceMatrix) => void): void {
    this.stop();
    this.scan().then(callback);
    this.scanInterval = setInterval(() => {
      this.scan().then(callback);
    }, this.config.scanIntervalMs);
  }

  stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  getLastMatrix(): PriceMatrix | null {
    return this.lastMatrix;
  }
}

export function createMarketScanner(
  rpcUrl: string,
  config?: Partial<MarketScannerConfig>
): MarketScanner {
  return new MarketScanner(rpcUrl, config);
}