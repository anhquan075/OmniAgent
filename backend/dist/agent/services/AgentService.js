"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentService = void 0;
const AutonomousLoop_1 = require("../AutonomousLoop");
/**
 * AgentService manages the lifecycle of the autonomous loop.
 */
class AgentService {
    static async runCycle() {
        console.log(`[AgentService] Running integrated AI SDK autonomous cycle...`);
        try {
            const result = await (0, AutonomousLoop_1.runAutonomousCycle)();
            return { actionTaken: 'COMPLETED', ...result };
        }
        catch (e) {
            console.error(`[AgentService] Autonomous cycle failed:`, e.message);
            return { actionTaken: 'FAILED', error: e.message };
        }
    }
}
exports.AgentService = AgentService;
