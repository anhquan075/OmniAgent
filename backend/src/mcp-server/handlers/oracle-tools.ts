import { Contract } from 'ethers';
import { getContracts } from '../../contracts/clients/ethers';
import { McpTool, MCP_ERRORS, McpToolResult } from '../types/mcp-protocol';

/** TWAPMultiOracle tools for flash-loan resistant price feeds */

export const oracleTools: McpTool[] = [
  {
    name: 'oracle_get_twap_price',
    description: 'Get 30-minute TWAP price from TWAPMultiOracle (flash-loan resistant). Returns time-weighted average price.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    outputSchema: {
      type: 'object',
      properties: {
        twapPrice: { type: 'string', description: 'TWAP price in 8-decimal fixed-point' },
        twapPriceFormatted: { type: 'string', description: 'Human-readable price (e.g., "2000.00")' },
        observationCount: { type: 'number', description: 'Number of observations in buffer' },
        twapWindow: { type: 'number', description: 'TWAP window in seconds (1800 = 30 min)' },
      },
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'defi',
  },
  {
    name: 'oracle_get_instant_price',
    description: 'Get instant (non-TWAP) prices from Chainlink feeds via adapters. Returns ETH/USD and BTC/USD.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    outputSchema: {
      type: 'object',
      properties: {
        ethUsd: { type: 'string', description: 'ETH/USD price in 8-decimal fixed-point' },
        ethUsdFormatted: { type: 'string', description: 'ETH/USD human-readable' },
        btcUsd: { type: 'string', description: 'BTC/USD price in 8-decimal fixed-point' },
        btcUsdFormatted: { type: 'string', description: 'BTC/USD human-readable' },
      },
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'defi',
  },
  {
    name: 'oracle_update_observation',
    description: 'Update TWAP observation. Records current price in the 30-min buffer. Requires 30s interval between calls.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        newObservationCount: { type: 'number' },
        currentPrice: { type: 'string' },
        twapPrice: { type: 'string' },
      },
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'defi',
  },
  {
    name: 'oracle_get_status',
    description: 'Get full status of TWAPMultiOracle including observations, locked status, and oracle sources.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    outputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string' },
        isLocked: { type: 'boolean' },
        observationCount: { type: 'number' },
        lastUpdateTime: { type: 'number' },
        twapWindow: { type: 'number' },
        observationInterval: { type: 'number' },
      },
    },
    version: '1.0.0',
    blockchain: 'sepolia',
    riskLevel: 'low',
    category: 'defi',
  },
];

function formatPrice(price: bigint): string {
  const priceNum = Number(price) / 1e8;
  return priceNum.toFixed(2);
}

const handleGetTwapPrice = async (): Promise<McpToolResult> => {
  try {
    const { twapOracle } = getContracts();

    const [twapPrice, observationCount] = await Promise.all([
      twapOracle.getTWAPPrice().catch(() => 0n),
      twapOracle.observationCount().catch(() => 0n),
    ]);

    return {
      success: true,
      data: {
        twapPrice: twapPrice.toString(),
        twapPriceFormatted: formatPrice(twapPrice),
        observationCount: Number(observationCount),
        twapWindow: 1800, // 30 minutes
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: {
        code: MCP_ERRORS.TOOL_EXECUTION_FAILED,
        message: `Failed to get TWAP price: ${message}`,
      },
    };
  }
};

// ChainlinkOracleAdapter addresses (wraps Chainlink feeds to IPriceOracle interface)
const CHAINLINK_ETH_USD_ADAPTER = '0xAbb4A2c701792f28D8e05D93F27cDadC75110917';
const CHAINLINK_BTC_USD_ADAPTER = '0xf3c8EA354B667771F69400Ea471316c13913455a';

const PRICE_ORACLE_ABI = ['function getPrice() view returns (uint256)'];

const handleGetInstantPrice = async (): Promise<McpToolResult> => {
  try {
    const { provider } = getContracts();

    // Use adapters directly (MultiOracleAggregator was deployed with incompatible addresses)
    const ethAdapter = new Contract(CHAINLINK_ETH_USD_ADAPTER, PRICE_ORACLE_ABI, provider);
    const btcAdapter = new Contract(CHAINLINK_BTC_USD_ADAPTER, PRICE_ORACLE_ABI, provider);

    // Sequential to avoid rate limiting
    let ethPrice = 0n;
    let btcPrice = 0n;
    try { ethPrice = await ethAdapter.getPrice(); } catch {}
    try { btcPrice = await btcAdapter.getPrice(); } catch {}

    return {
      success: true,
      data: {
        ethUsd: ethPrice.toString(),
        ethUsdFormatted: formatPrice(ethPrice),
        btcUsd: btcPrice.toString(),
        btcUsdFormatted: formatPrice(btcPrice),
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: {
        code: MCP_ERRORS.TOOL_EXECUTION_FAILED,
        message: `Failed to get instant price: ${message}`,
      },
    };
  }
};

const handleUpdateObservation = async (): Promise<McpToolResult> => {
  try {
    const { twapOracle } = getContracts();

    const { getSigner } = await import('../../contracts/clients/ethers.js');
    const signer = await getSigner();
    const twapWithSigner = twapOracle.connect(signer);

    const tx = await (twapWithSigner as any).updateObservation();
    const receipt = await tx.wait();

    const [newCount, currentPrice, twapPrice] = await Promise.all([
      twapOracle.observationCount(),
      twapOracle.getPrice(),
      twapOracle.getTWAPPrice(),
    ]);

    return {
      success: true,
      data: {
        success: true,
        txHash: receipt.hash,
        newObservationCount: Number(newCount),
        currentPrice: formatPrice(currentPrice),
        twapPrice: formatPrice(twapPrice),
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: {
        code: MCP_ERRORS.TOOL_EXECUTION_FAILED,
        message: `Failed to update observation: ${message}`,
      },
    };
  }
};

const handleGetStatus = async (): Promise<McpToolResult> => {
  try {
    const { twapOracle } = getContracts();
    const address = await twapOracle.getAddress();

    const [isLocked, observationCount, lastUpdateTime, twapWindow] = await Promise.all([
      twapOracle.locked().catch(() => false),
      twapOracle.observationCount().catch(() => 0n),
      twapOracle.lastUpdateTime().catch(() => 0n),
      twapOracle.twapWindow().catch(() => 1800n),
    ]);

    return {
      success: true,
      data: {
        address,
        isLocked,
        observationCount: Number(observationCount),
        lastUpdateTime: Number(lastUpdateTime),
        twapWindow: Number(twapWindow),
        observationInterval: 30, // seconds
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: {
        code: MCP_ERRORS.TOOL_EXECUTION_FAILED,
        message: `Failed to get oracle status: ${message}`,
      },
    };
  }
};

export const oracleHandlers: Record<string, (params: Record<string, unknown>) => Promise<McpToolResult>> = {
  oracle_get_twap_price: handleGetTwapPrice,
  oracle_get_instant_price: handleGetInstantPrice,
  oracle_update_observation: handleUpdateObservation,
  oracle_get_status: handleGetStatus,
};
