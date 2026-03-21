"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.robotFleetService = void 0;
const logger_1 = require("../utils/logger");
const events_1 = require("events");
const simulator = __importStar(require("../scripts/robot-simulator"));
class RobotFleetService {
    static instance;
    emitter;
    simulator = simulator;
    isRunning = false;
    constructor() {
        this.emitter = new events_1.EventEmitter();
        if (this.simulator && typeof this.simulator.startSimulator === 'function') {
            logger_1.logger.info('[RobotFleetService] Simulator module loaded statically');
        }
        else {
            logger_1.logger.warn('[RobotFleetService] Simulator module missing startSimulator');
        }
    }
    async startSimulator() {
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
                enabled: process.env.ROBOT_FLEET_ENABLED === 'true',
                robots: [],
                fleetTotalEarned: '0.0000',
                recentEvents: [],
                latestTxHash: null,
                latestTxValue: null
            };
        }
        return this.simulator.getFleetStatus?.() || {
            enabled: process.env.ROBOT_FLEET_ENABLED === 'true',
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
