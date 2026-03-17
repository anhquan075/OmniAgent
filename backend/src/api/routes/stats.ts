import { Hono } from 'hono';
import { getContracts } from '@/contracts/clients/ethers';
import { ethers } from 'ethers';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

const stats = new Hono();

stats.get('/', async (c) => {
  try {
    logger.debug('[Stats] Fetching data from contracts');
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
      vault.totalAssets().catch((e) => { logger.error(e, "vault.totalAssets error"); return 0n; }),
      vault.bufferStatus().catch((e) => { logger.error(e, "vault.bufferStatus error"); return { utilizationBps: 0n, current: 0n, target: 0n }; }),
      zkOracle.getVerifiedRiskBands().catch((e) => { 
        logger.error(e, "zkOracle.getVerifiedRiskBands error");
        return {
          monteCarloDrawdownBps: 0,
          verifiedSharpeRatio: 0,
          timestamp: Math.floor(Date.now() / 1000),
          recommendedBufferBps: 500
        };
      }),
      breaker.isPaused().catch((e) => { logger.error(e, "breaker.isPaused error"); return false; }),
      engine.canExecute().catch((e) => { logger.error(e, "engine.canExecute error"); return [false, "0x00"]; }),
      engine.previewDecision().catch((e) => { logger.error(e, "engine.previewDecision error"); return { targetWDKBps: 0n, state: 0n }; }),
      usdt.balanceOf(env.WDK_VAULT_ADDRESS).catch((e) => { logger.error(e, "usdt.balanceOf error"); return 0n; })
    ]);

    logger.debug('[Stats] Formatting response');
    
    const [canExecute, executeReason] = executionStatus || [false, "0x00"];

    // Format results
    const response = {
      vault: {
        totalAssets: ethers.formatUnits(totalAssets || 0n, 18),
        bufferUtilizationBps: (bufferStatus?.utilizationBps || 0n).toString(),
        bufferCurrent: ethers.formatUnits(bufferStatus?.current || 0n, 18),
        bufferTarget: ethers.formatUnits(bufferStatus?.target || 0n, 18),
        usdtBalance: ethers.formatUnits(usdtBalance || 0n, 18)
      },
      risk: {
        level: Number(riskMetrics?.monteCarloDrawdownBps || 0) >= 2000 ? 'HIGH' : Number(riskMetrics?.monteCarloDrawdownBps || 0) >= 1000 ? 'MEDIUM' : 'LOW',
        drawdownBps: Number(riskMetrics?.monteCarloDrawdownBps || 0),
        sharpe: Number(riskMetrics?.verifiedSharpeRatio || 0) / 100,
        timestamp: Number(riskMetrics?.timestamp || 0)
      },
      system: {
        isPaused: !!isPaused,
        canExecute: !!canExecute,
        executeReason: typeof executeReason === 'string' && executeReason.startsWith('0x') && executeReason.length > 2 
          ? (executeReason.startsWith('0x0000') || executeReason === '0x00' ? 'NONE' : (function() { try { return ethers.decodeBytes32String(executeReason); } catch { return 'UNKNOWN'; } })()) 
          : 'UNKNOWN',
        targetWDKBps: Number(preview?.targetWDKBps || 0n),
        state: Number(preview?.state || 0n)
      },
      timestamp: Date.now()
    };

    return c.json(response);
  } catch (error: any) {
    logger.error(error, "Stats Error (Fatal)");
    return c.json({ error: error.message }, 500);
  }
});

export default stats;
