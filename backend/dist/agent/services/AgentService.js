"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentService = void 0;
const AutonomousLoop_1 = require("../AutonomousLoop");
const logger_1 = require("@/utils/logger");
/**
 * AgentService manages the lifecycle of the autonomous loop.
 */
class AgentService {
    static async runCycle() {
        logger_1.logger.info('[AgentService] Running integrated AI SDK autonomous cycle');
        try {
            const result = await (0, AutonomousLoop_1.runAutonomousCycle)();
            return { actionTaken: 'COMPLETED', ...result };
        }
        catch (e) {
            logger_1.logger.error(e, '[AgentService] Autonomous cycle failed');
            return { actionTaken: 'FAILED', error: e.message };
        }
    }
}
exports.AgentService = AgentService;
