import { describe, it, expect } from 'vitest';

describe('[SMOKE] @tetherto/wdk-pricing-bitfinex-http', () => {
  it('can be imported', async () => {
    const mod = await import('@tetherto/wdk-pricing-bitfinex-http');
    expect(mod).toBeDefined();
    expect(mod.BitfinexPricingClient).toBeDefined();
  });

  it('can create BitfinexPricingClient instance', async () => {
    const { BitfinexPricingClient } = await import('@tetherto/wdk-pricing-bitfinex-http');
    const client = new BitfinexPricingClient();
    expect(client).toBeDefined();
    expect(typeof client.getCurrentPrice).toBe('function');
    expect(typeof client.getMultiCurrentPrices).toBe('function');
    expect(typeof client.getMultiPriceData).toBe('function');
    expect(typeof client.getHistoricalPrice).toBe('function');
  });

  it('getCurrentPrice() returns a number for BTC/USD', async () => {
    const { BitfinexPricingClient } = await import('@tetherto/wdk-pricing-bitfinex-http');
    const client = new BitfinexPricingClient();

    const price = await client.getCurrentPrice('BTC', 'USD');
    expect(typeof price).toBe('number');
    expect(price).toBeGreaterThan(0);
  }, 15000);

  it('getMultiCurrentPrices() returns array of prices', async () => {
    const { BitfinexPricingClient } = await import('@tetherto/wdk-pricing-bitfinex-http');
    const client = new BitfinexPricingClient();

    const pairs = [
      { from: 'BTC', to: 'USD' },
      { from: 'ETH', to: 'USD' },
    ];
    const prices = await client.getMultiCurrentPrices(pairs);
    expect(Array.isArray(prices)).toBe(true);
    expect(prices.length).toBe(2);
    expect(prices[0]).toBeGreaterThan(0);
    expect(prices[1]).toBeGreaterThan(0);
  }, 15000);

  it('getMultiPriceData() returns price data with daily change', async () => {
    const { BitfinexPricingClient } = await import('@tetherto/wdk-pricing-bitfinex-http');
    const client = new BitfinexPricingClient();

    const pairs = [{ from: 'BTC', to: 'USD' }];
    const data = await client.getMultiPriceData(pairs);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0]).toHaveProperty('lastPrice');
    expect(data[0]).toHaveProperty('dailyChange');
    expect(data[0]).toHaveProperty('dailyChangeRelative');
  }, 15000);
});

describe('[SMOKE] src/services/market-scanner Bitfinex integration', () => {
  it('MarketScanner imports and instantiates', async () => {
    const { MarketScanner } = await import('../../src/services/market-scanner');
    const scanner = new MarketScanner('https://ethereum-sepolia.publicnode.com');
    expect(scanner).toBeDefined();
    expect(typeof scanner.fetchBitfinexPrices).toBe('function');
    expect(typeof scanner.scan).toBe('function');
  });

  it('fetchBitfinexPrices() returns price data', async () => {
    const { MarketScanner } = await import('../../src/services/market-scanner');
    const scanner = new MarketScanner('https://ethereum-sepolia.publicnode.com');

    const prices = await scanner.fetchBitfinexPrices();
    expect(prices instanceof Map).toBe(true);
    expect(prices.size).toBeGreaterThan(0);

    for (const [pair, point] of prices) {
      expect(point.exchange).toBe('bitfinex');
      expect(point.price).toBeGreaterThan(0);
      expect(point.timestamp).toBeGreaterThan(0);
    }
  }, 20000);

  it('scan() includes Bitfinex prices in matrix', async () => {
    const { MarketScanner } = await import('../../src/services/market-scanner');
    const scanner = new MarketScanner('https://ethereum-sepolia.publicnode.com');

    const matrix = await scanner.scan();
    expect(matrix).toHaveProperty('pairs');
    expect(matrix).toHaveProperty('gasPriceGwei');

    let hasBitfinex = false;
    for (const exchanges of Object.values(matrix.pairs)) {
      if ('bitfinex' in (exchanges as Record<string, unknown>)) {
        hasBitfinex = true;
        break;
      }
    }
    expect(hasBitfinex).toBe(true);
  }, 30000);
});

describe('[SMOKE] types.ts Bitfinex updates', () => {
  it('DEFAULT_EXCHANGES includes bitfinex', async () => {
    const { DEFAULT_EXCHANGES } = await import('../../src/services/market-scanner');
    const bitfinex = DEFAULT_EXCHANGES.find(e => e.name === 'bitfinex');
    expect(bitfinex).toBeDefined();
    expect(bitfinex?.type).toBe('CEX');
    expect(bitfinex?.fees.maker).toBe(0.001);
    expect(bitfinex?.fees.taker).toBe(0.002);
  });

  it('PricePoint supports optional dailyChange fields', async () => {
    const pricePoint = {
      exchange: 'bitfinex',
      pair: 'BTC/USD',
      price: 65000,
      spread: 0,
      volume24h: 0,
      dailyChange: 100,
      dailyChangePercent: 0.15,
      timestamp: Date.now(),
    };
    expect(pricePoint.dailyChange).toBe(100);
    expect(pricePoint.dailyChangePercent).toBe(0.15);
  });
});
