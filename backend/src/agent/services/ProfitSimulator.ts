import { ethers } from 'ethers';
import axios from 'axios';
import { logger } from '@/utils/logger';

export interface GasEstimate {
  gasUsed: string;
  gasPrice: string;
  totalGasCost: string; // in USDT equivalent
  estimatedFee: string; // gas cost in USDT
}

export interface YieldCalculation {
  principalAmount: string;
  projectedYield: string; // projected yield in USDT
  yieldPercentage: number; // APY %
  timeframe: string; // "daily" | "weekly" | "monthly" | "yearly"
}

export interface ProfitSimulation {
  action: string;
  inputAmount: string;
  estimatedOutput: string;
  gasEstimate: GasEstimate;
  netProfit: string; // output - input - gas
  profitMargin: number; // net profit as percentage
  yieldProjection: YieldCalculation;
  isViable: boolean; // is the action profitable after gas?
}

export class ProfitSimulator {
  private rpcUrl: string;
  private gasPrice: bigint = 0n;
  private lastGasPriceUpdate: Date = new Date();
  private gasTokenPrice: number = 0; // BNB price in USD

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  /**
   * Fetch current gas price from RPC
   */
  private async fetchGasPrice(): Promise<bigint> {
    const timeSinceUpdate = Date.now() - this.lastGasPriceUpdate.getTime();
    
    // Cache gas price for 30 seconds
    if (timeSinceUpdate < 30000 && this.gasPrice > 0n) {
      return this.gasPrice;
    }

    try {
      const provider = new ethers.JsonRpcProvider(this.rpcUrl);
      const feeData = await provider.getFeeData();
      
      if (feeData.gasPrice) {
        this.gasPrice = feeData.gasPrice;
        this.lastGasPriceUpdate = new Date();
        return this.gasPrice;
      }
    } catch (e) {
      logger.error(e, '[ProfitSimulator] Failed to fetch gas price');
    }

    return this.gasPrice || ethers.parseUnits('5', 'gwei');
  }

  /**
   * Fetch BNB/USD price
   */
  private async fetchGasTokenPrice(): Promise<number> {
    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd',
        { timeout: 5000 }
      );
      const price = response.data?.binancecoin?.usd || 0;
      if (price > 0) {
        this.gasTokenPrice = price;
      }
      return this.gasTokenPrice;
    } catch (e) {
      logger.error(e, '[ProfitSimulator] Failed to fetch BNB price');
      return this.gasTokenPrice || 600; // Fallback estimate
    }
  }

  /**
   * Estimate gas for a swap transaction
   * Conservative estimate: assumes ~200k gas for typical swap
   */
  async estimateSwapGas(params: {
    fromToken: string;
    toToken: string;
    amount: string;
  }): Promise<GasEstimate> {
    const gasPrice = await this.fetchGasPrice();
    const bnbPrice = await this.fetchGasTokenPrice();

    // Conservative estimates:
    // - Simple swap: 150k-200k gas
    // - Complex route: 250k-350k gas
    const estimatedGas = 200000n;
    
    const gasCostBN = estimatedGas * gasPrice;
    const gasCostETH = ethers.formatEther(gasCostBN);
    const gasCostUSDT = parseFloat(gasCostETH) * bnbPrice;

    return {
      gasUsed: estimatedGas.toString(),
      gasPrice: gasPrice.toString(),
      totalGasCost: ethers.parseUnits(gasCostUSDT.toFixed(6), 6).toString(),
      estimatedFee: ethers.parseUnits(gasCostUSDT.toFixed(2), 6).toString(),
    };
  }

  /**
   * Estimate gas for a bridge transaction
   * Bridges are more expensive: 300k-500k gas
   */
  async estimateBridgeGas(params: {
    fromChain: string;
    toChain: string;
    amount: string;
  }): Promise<GasEstimate> {
    const gasPrice = await this.fetchGasPrice();
    const bnbPrice = await this.fetchGasTokenPrice();

    // Bridge operations are expensive
    const estimatedGas = 350000n;
    
    const gasCostBN = estimatedGas * gasPrice;
    const gasCostETH = ethers.formatEther(gasCostBN);
    const gasCostUSDT = parseFloat(gasCostETH) * bnbPrice;

    return {
      gasUsed: estimatedGas.toString(),
      gasPrice: gasPrice.toString(),
      totalGasCost: ethers.parseUnits(gasCostUSDT.toFixed(6), 6).toString(),
      estimatedFee: ethers.parseUnits(gasCostUSDT.toFixed(2), 6).toString(),
    };
  }

  /**
   * Calculate projected yield for a position
   */
  calculateYieldProjection(params: {
    principalAmount: string; // in smallest units (6 decimals for USDT)
    apy: number; // annual percentage yield
    timeframe: 'daily' | 'weekly' | 'monthly' | 'yearly';
  }): YieldCalculation {
    const principal = BigInt(params.principalAmount);
    const apy = BigInt(Math.floor(params.apy * 100)); // Convert to basis points

    let yieldAmount = 0n;
    let description = params.timeframe;

    switch (params.timeframe) {
      case 'daily':
        yieldAmount = (principal * apy) / (365n * 10000n);
        break;
      case 'weekly':
        yieldAmount = (principal * apy) / (52n * 10000n);
        break;
      case 'monthly':
        yieldAmount = (principal * apy) / (12n * 10000n);
        break;
      case 'yearly':
        yieldAmount = (principal * apy) / 10000n;
        break;
    }

    const yieldPercentage = (params.apy * 100) / 100; // Already in percentage

    return {
      principalAmount: params.principalAmount,
      projectedYield: yieldAmount.toString(),
      yieldPercentage,
      timeframe: params.timeframe,
    };
  }

  /**
   * Simulate a swap profitability
   */
  async simulateSwap(params: {
    inputAmount: string; // in smallest units
    inputToken: string;
    outputToken: string;
    expectedOutput: string; // estimated output from DEX
    slippage: number; // slippage tolerance in %
  }): Promise<ProfitSimulation> {
    const gasEstimate = await this.estimateSwapGas({
      fromToken: params.inputToken,
      toToken: params.outputToken,
      amount: params.inputAmount,
    });

    const inputBN = BigInt(params.inputAmount);
    const outputBN = BigInt(params.expectedOutput);
    const gasCostBN = BigInt(gasEstimate.totalGasCost);

    // Net profit = output - input - gas
    const netProfit = outputBN - inputBN - gasCostBN;
    const profitMargin = inputBN > 0n ? (Number(netProfit) / Number(inputBN)) * 100 : 0;

    return {
      action: 'SWAP',
      inputAmount: params.inputAmount,
      estimatedOutput: params.expectedOutput,
      gasEstimate,
      netProfit: netProfit.toString(),
      profitMargin,
      yieldProjection: {
        principalAmount: params.inputAmount,
        projectedYield: '0',
        yieldPercentage: 0,
        timeframe: 'daily',
      },
      isViable: netProfit > 0n,
    };
  }

  /**
   * Simulate a bridge operation profitability
   */
  async simulateBridge(params: {
    inputAmount: string;
    fromChain: string;
    toChain: string;
    expectedYieldDifference: number; // yield difference as % APY
    holdingPeriodDays: number;
  }): Promise<ProfitSimulation> {
    const gasEstimate = await this.estimateBridgeGas({
      fromChain: params.fromChain,
      toChain: params.toChain,
      amount: params.inputAmount,
    });

    const inputBN = BigInt(params.inputAmount);
    const gasCostBN = BigInt(gasEstimate.totalGasCost);

    const principal = Number(ethers.formatUnits(inputBN, 6));
    const yieldDiffBps = Math.floor(params.expectedYieldDifference * 100);
    const yieldDiffDaily = (principal * yieldDiffBps) / 365 / 10000;
    const totalExtraYield = yieldDiffDaily * params.holdingPeriodDays;
    const extraYieldBN = BigInt(Math.round(totalExtraYield * 1e6));

    // Net profit = extra yield - gas cost
    const netProfit = extraYieldBN - gasCostBN;
    const profitMargin = inputBN > 0n ? (Number(netProfit) / Number(inputBN)) * 100 : 0;

    return {
      action: 'BRIDGE',
      inputAmount: params.inputAmount,
      estimatedOutput: inputBN.toString(), // Same amount, different chain
      gasEstimate,
      netProfit: netProfit.toString(),
      profitMargin,
      yieldProjection: this.calculateYieldProjection({
        principalAmount: params.inputAmount,
        apy: params.expectedYieldDifference,
        timeframe: 'daily',
      }),
      isViable: netProfit > 0n,
    };
  }

  /**
   * Simulate a rebalance operation
   */
  async simulateRebalance(params: {
    portfolioValue: string;
    currentAllocation: Record<string, number>; // token -> percentage
    targetAllocation: Record<string, number>;
    estimatedGasPerSwap: string; // per swap estimate in USDT
  }): Promise<ProfitSimulation> {
    const numSwaps = Object.keys(params.currentAllocation).length;
    const totalGasCost = BigInt(params.estimatedGasPerSwap) * BigInt(numSwaps);

    const portfolioValueBN = BigInt(params.portfolioValue);
    
    // Rebalancing has minimal immediate profit but reduces risk
    const netProfit = -totalGasCost; // Just the gas cost
    const profitMargin = (Number(netProfit) / Number(portfolioValueBN)) * 100;

    return {
      action: 'REBALANCE',
      inputAmount: params.portfolioValue,
      estimatedOutput: (portfolioValueBN + netProfit).toString(),
      gasEstimate: {
        gasUsed: (BigInt(200000) * BigInt(numSwaps)).toString(),
        gasPrice: '5000000000', // 5 gwei placeholder
        totalGasCost: totalGasCost.toString(),
        estimatedFee: totalGasCost.toString(),
      },
      netProfit: netProfit.toString(),
      profitMargin,
      yieldProjection: {
        principalAmount: params.portfolioValue,
        projectedYield: '0',
        yieldPercentage: 0,
        timeframe: 'daily',
      },
      isViable: true, // Rebalancing is always "viable" for risk management
    };
  }
}

export function createProfitSimulator(rpcUrl: string): ProfitSimulator {
  return new ProfitSimulator(rpcUrl);
}
