"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.robotFleetService = void 0;
const logger_1 = require("../utils/logger");
const events_1 = require("events");
class RobotFleetService {
    static instance;
    emitter;
    simulator = null;
    isRunning = false;
    constructor() {
        this.emitter = new events_1.EventEmitter();
        this.init();
    }
    async init() {
        try {
            const paths = [
                '../scripts/robot-simulator',
                '../../scripts/robot-simulator',
                '../../../scripts/robot-simulator'
            ];
            for (const p of paths) {
                try {
                    const mod = await import(p);
                    this.simulator = mod.default || mod;
                    if (this.simulator && typeof this.simulator.startSimulator === 'function') {
                        logger_1.logger.info({ path: p }, '[RobotFleetService] Simulator module loaded');
                        break;
                    }
                }
                catch (e) {
                }
            }
            if (!this.simulator || typeof this.simulator.startSimulator !== 'function') {
                for (const p of paths) {
                    try {
                        const mod = require(p);
                        this.simulator = mod.default || mod;
                        if (this.simulator && typeof this.simulator.startSimulator === 'function') {
                            logger_1.logger.info({ path: p }, '[RobotFleetService] Simulator module loaded via require');
                            break;
                        }
                    }
                    catch (e) {
                    }
                }
            }
            if (this.simulator) {
                logger_1.logger.info('[RobotFleetService] Simulator module initialized');
            }
            else {
                logger_1.logger.warn('[RobotFleetService] Simulator module not found in any search path');
            }
        }
        catch (error) {
            logger_1.logger.error(error, '[RobotFleetService] Error during simulator initialization');
        }
    }
    async startSimulator() {
        if (!this.simulator) {
            await this.init();
        }
        if (!this.simulator || typeof this.simulator.startSimulator !== 'function') {
            throw new Error('Simulator not loaded or startSimulator function not available');
        }
        if (this.isRunning) {
            logger_1.logger.debug('[RobotFleetService] Simulator already running');
            return;
        }
        logger_1.logger.info('[RobotFleetService] Starting simulator');
        await this.simulator.startSimulator();
        this.isRunning = true;
    }
    static getInstance() {
        if (!RobotFleetService.instance) {
            RobotFleetService.instance = new RobotFleetService();
        }
        return RobotFleetService.instance;
    }
    getRecentEvents() {
        if (!this.simulator)
            return [];
        return this.simulator.getRecentEvents?.() || [];
    }
    getRobots() {
        if (!this.simulator)
            return [];
        return this.simulator.getRobots?.() || [];
    }
    getFleetStatus() {
        if (!this.simulator) {
            return {
                enabled: false,
                robots: [],
                fleetTotalEarned: '0.0000',
                recentEvents: [],
                latestTxHash: null,
                latestTxValue: null
            };
        }
        return this.simulator.getFleetStatus?.() || {
            enabled: false,
            robots: [],
            fleetTotalEarned: '0.0000',
            recentEvents: [],
            latestTxHash: null,
            latestTxValue: null
        };
    }
    getEmitter() {
        if (this.simulator?.fleetEmitter) {
            return this.simulator.fleetEmitter;
        }
        return this.emitter;
    }
}
exports.robotFleetService = RobotFleetService.getInstance();
