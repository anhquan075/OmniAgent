import { Hono } from 'hono';
import { getContracts } from '@/contracts/clients/ethers';
import { ethers } from 'ethers';

const stats = new Hono();

stats.get('/', async (c) => {
  try {
    const { vault, zkOracle, breaker, engine, usdt } = getContracts();

    // Fetch in parallel with individual error handling
    const [
      totalAssets,
      bufferStatus,
      riskMetrics,
      isPaused,
      executionStatus,
      preview,
      usdtBalance
    ] = await Promise.all([
      vault.totalAssets().catch(() => 0n),
      vault.bufferStatus().catch(() => ({ utilizationBps: 0n, current: 0n, target: 0n })),
      zkOracle.getVerifiedRiskBands().catch(() => ({
        monteCarloDrawdownBps: 0,
        verifiedSharpeRatio: 0,
        timestamp: Math.floor(Date.now() / 1000),
        recommendedBufferBps: 500
      })),
      breaker.isPaused().catch(() => false),
      engine.canExecute().catch(() => [false, "0x00"]),
      engine.previewDecision().catch(() => ({ targetWDKBps: 0, state: 0 })),
      usdt.balanceOf(vault.getAddress()).catch(() => 0n)
    ]);

    const [canExecute, executeReason] = executionStatus;

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
        executeReason: typeof executeReason === 'string' && executeReason.startsWith('0x') && executeReason.length > 2 
          ? (executeReason === '0x00' ? 'NONE' : (function() { try { return ethers.decodeBytes32String(executeReason); } catch { return 'UNKNOWN'; } })()) 
          : 'UNKNOWN',
        targetWDKBps: Number(preview.targetWDKBps),
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
