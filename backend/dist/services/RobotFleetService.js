"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.robotFleetService = void 0;
const events_1 = require("events");
class RobotFleetService {
    static instance;
    emitter;
    simulator = null;
    isRunning = false;
    constructor() {
        this.emitter = new events_1.EventEmitter();
        this.loadSimulator();
    }
    loadSimulator() {
        try {
            try {
                this.simulator = require('../../scripts/robot-simulator');
            }
            catch (e1) {
                this.simulator = require('../../../scripts/robot-simulator');
            }
            console.log('[RobotFleetService] Simulator module loaded (not started)');
        }
        catch (error) {
            console.warn('[RobotFleetService] Simulator not loaded:', error.message);
        }
    }
    async startSimulator() {
        if (!this.simulator || typeof this.simulator.startSimulator !== 'function') {
            throw new Error('Simulator not loaded or startSimulator function not available');
        }
        if (this.isRunning) {
            console.log('[RobotFleetService] Simulator already running');
            return;
        }
        console.log('[RobotFleetService] Starting simulator...');
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
                recentEvents: []
            };
        }
        return this.simulator.getFleetStatus?.() || {
            enabled: false,
            robots: [],
            fleetTotalEarned: '0.0000',
            recentEvents: []
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
