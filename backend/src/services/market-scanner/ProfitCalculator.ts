import { ethers } from 'ethers';

export interface ProfitAnalysis {
  grossProfitUsd: number;
  gasCostUsd: number;
  slippageCostUsd: number;
  netProfitUsd: number;
  isProfitable: boolean;
  profitMarginBps: number;
  recommendation: 'EXECUTE' | 'SKIP' | 'WAIT';
}

export interface ProfitCalcParams {
  spreadBps: number;
  volumeUsd: number;
  gasEstimate: number;
  gasPriceGwei: number;
  ethPriceUsd: number;
  buyFeeBps: number;
  sellFeeBps: number;
  slippageBps?: number;
}

const DEFAULT_SLIPPAGE_BPS = 50;

export function calculateProfit(params: ProfitCalcParams): ProfitAnalysis {
  const {
    spreadBps,
    volumeUsd,
    gasEstimate,
    gasPriceGwei,
    ethPriceUsd,
    buyFeeBps,
    sellFeeBps,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
  } = params;

  const grossProfitUsd = volumeUsd * (spreadBps / 10000);

  const totalFeeBps = buyFeeBps + sellFeeBps;
  const feeCostUsd = volumeUsd * (totalFeeBps / 10000);

  const gasCostWei = BigInt(Math.floor(gasEstimate)) * ethers.parseUnits(String(gasPriceGwei), 'gwei');
  const gasCostEth = Number(ethers.formatEther(gasCostWei));
  const gasCostUsd = gasCostEth * ethPriceUsd;

  const slippageCostUsd = volumeUsd * (slippageBps / 10000);

  const netProfitUsd = grossProfitUsd - feeCostUsd - gasCostUsd - slippageCostUsd;

  const isProfitable = netProfitUsd > 0 && spreadBps > (totalFeeBps + slippageBps);

  const profitMarginBps = isProfitable ? Math.floor((netProfitUsd / volumeUsd) * 10000) : 0;

  let recommendation: 'EXECUTE' | 'SKIP' | 'WAIT';
  if (netProfitUsd > gasCostUsd * 2 && spreadBps > 20) {
    recommendation = 'EXECUTE';
  } else if (spreadBps < 10) {
    recommendation = 'WAIT';
  } else {
    recommendation = 'SKIP';
  }

  return {
    grossProfitUsd,
    gasCostUsd,
    slippageCostUsd,
    netProfitUsd,
    isProfitable,
    profitMarginBps,
    recommendation,
  };
}

export function shouldExecute(params: ProfitCalcParams): boolean {
  const analysis = calculateProfit(params);
  return analysis.recommendation === 'EXECUTE';
}

export function formatProfitAnalysis(analysis: ProfitAnalysis): string {
  const lines = [
    `Gross Profit: $${analysis.grossProfitUsd.toFixed(2)}`,
    `Gas Cost: $${analysis.gasCostUsd.toFixed(2)}`,
    `Slippage Cost: $${analysis.slippageCostUsd.toFixed(2)}`,
    `Net Profit: $${analysis.netProfitUsd.toFixed(2)}`,
    `Profit Margin: ${analysis.profitMarginBps / 100}%`,
    `Recommendation: ${analysis.recommendation}`,
  ];
  return lines.join('\n');
}