import { runAutonomousCycle } from '../AutonomousLoop';

/**
 * AgentService manages the lifecycle of the autonomous loop.
 */
export class AgentService {
  static async runCycle() {
    console.log(`[AgentService] Running integrated AI SDK autonomous cycle...`);
    try {
      const result = await runAutonomousCycle();
      return { actionTaken: 'COMPLETED', ...result };
    } catch (e: any) {
      console.error(`[AgentService] Autonomous cycle failed:`, e.message);
      return { actionTaken: 'FAILED', error: e.message };
    }
  }
}
