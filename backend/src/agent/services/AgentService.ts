import { runAutonomousCycle } from '../AutonomousLoop';
import { logger } from '@/utils/logger';

/**
 * AgentService manages the lifecycle of the autonomous loop.
 */
export class AgentService {
  static async runCycle() {
    logger.info('[AgentService] Running integrated AI SDK autonomous cycle');
    try {
      const result = await runAutonomousCycle();
      return { actionTaken: 'COMPLETED', ...result };
    } catch (e: any) {
      logger.error(e, '[AgentService] Autonomous cycle failed');
      return { actionTaken: 'FAILED', error: e.message };
    }
  }
}
