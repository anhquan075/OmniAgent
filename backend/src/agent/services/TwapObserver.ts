import { getContracts, getSigner } from '@/contracts/clients/ethers';
import { logger } from '@/utils/logger';

/** TWAP observer that updates observations every 30s */

const OBSERVATION_INTERVAL_MS = 30_000;
let intervalId: ReturnType<typeof setInterval> | null = null;
let lastUpdateTimestamp = 0;
let updateCount = 0;
let errorCount = 0;

export async function updateObservation(): Promise<{ success: boolean; hash?: string; error?: string }> {
  try {
    const { twapOracle } = getContracts();
    const signer = await getSigner();
    const twapWithSigner = twapOracle.connect(signer);

    const tx = await (twapWithSigner as any).updateObservation();
    const receipt = await tx.wait();

    lastUpdateTimestamp = Date.now();
    updateCount++;

    logger.info({
      txHash: receipt.hash,
      updateCount,
    }, '[TwapObserver] Observation updated');

    return { success: true, hash: receipt.hash };
  } catch (error: unknown) {
    errorCount++;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn({ error: message, errorCount }, '[TwapObserver] Update failed');
    return { success: false, error: message };
  }
}

export function startTwapObserver(): void {
  if (intervalId) {
    logger.warn('[TwapObserver] Already running');
    return;
  }

  logger.info({ intervalMs: OBSERVATION_INTERVAL_MS }, '[TwapObserver] Starting');

  intervalId = setInterval(async () => {
    await updateObservation();
  }, OBSERVATION_INTERVAL_MS);
}

export function stopTwapObserver(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[TwapObserver] Stopped');
  }
}

export function getTwapObserverStatus() {
  return {
    running: intervalId !== null,
    intervalMs: OBSERVATION_INTERVAL_MS,
    lastUpdateTimestamp,
    updateCount,
    errorCount,
  };
}
