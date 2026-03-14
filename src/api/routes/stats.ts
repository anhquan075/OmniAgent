import { Hono } from 'hono';
import { getContracts } from '@/contracts/clients/ethers';
import { ethers } from 'ethers';

const stats = new Hono();

stats.get('/', async (c) => {
  try {
    const { vault, zkOracle, breaker, engine, usdt } = getContracts();

    // Fetch in parallel
    const [
      totalAssets,
      bufferStatus,
      riskMetrics,
      isPaused,
      [canExecute, executeReason],
      preview,
      usdtBalance
    ] = await Promise.all([
      vault.totalAssets(),
      vault.bufferStatus(),
      zkOracle.getVerifiedRiskBands(),
      breaker.isPaused(),
      engine.canExecute(),
      engine.previewDecision(),
      usdt.balanceOf(await vault.getAddress())
    ]);

    // Format results
    const response = {
      vault: {
        totalAssets: ethers.formatUnits(totalAssets, 18),
        bufferUtilizationBps: bufferStatus.utilizationBps.toString(),
        bufferCurrent: ethers.formatUnits(bufferStatus.current, 18),
        bufferTarget: ethers.formatUnits(bufferStatus.target, 18),
        usdtBalance: ethers.formatUnits(usdtBalance, 18)
      },
      risk: {
        level: Number(riskMetrics.monteCarloDrawdownBps) >= 2000 ? 'HIGH' : Number(riskMetrics.monteCarloDrawdownBps) >= 1000 ? 'MEDIUM' : 'LOW',
        drawdownBps: Number(riskMetrics.monteCarloDrawdownBps),
        sharpe: Number(riskMetrics.verifiedSharpeRatio) / 100,
        timestamp: Number(riskMetrics.timestamp)
      },
      system: {
        isPaused,
        canExecute,
        executeReason: ethers.decodeBytes32String(executeReason),
        targetAsterBps: Number(preview.targetAsterBps),
        state: Number(preview.state)
      },
      timestamp: Date.now()
    };

    return c.json(response);
  } catch (error: any) {
    console.error("Stats Error:", error);
    return c.json({ error: error.message }, 500);
  }
});

export default stats;
