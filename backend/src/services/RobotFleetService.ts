import { EventEmitter } from 'events';

export interface FleetEvent {
  robotId: string;
  type: string;
  icon: string;
  taskName: string;
  earnings: string;
  timestamp: string;
  txHash?: string;
}

export interface Robot {
  id: string;
  type: string;
  icon: string;
  status: 'Working' | 'Idle';
  totalEarned: string;
  taskCount: number;
}

export interface FleetStatus {
  enabled: boolean;
  robots: Robot[];
  fleetTotalEarned: string;
  recentEvents: FleetEvent[];
}

class RobotFleetService {
  private static instance: RobotFleetService;
  public emitter: EventEmitter;
  private simulator: any = null;
  private isRunning: boolean = false;

  private constructor() {
    this.emitter = new EventEmitter();
    this.loadSimulator();
  }

  private loadSimulator() {
    try {
      try {
        this.simulator = require('../../scripts/robot-simulator');
      } catch (e1) {
        this.simulator = require('../../../scripts/robot-simulator');
      }
      console.log('[RobotFleetService] Simulator module loaded (not started)');
    } catch (error: any) {
      console.warn('[RobotFleetService] Simulator not loaded:', error.message);
    }
  }

  public async startSimulator(): Promise<void> {
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

  public static getInstance(): RobotFleetService {
    if (!RobotFleetService.instance) {
      RobotFleetService.instance = new RobotFleetService();
    }
    return RobotFleetService.instance;
  }

  getRecentEvents(): FleetEvent[] {
    if (!this.simulator) return [];
    return this.simulator.getRecentEvents?.() || [];
  }

  getRobots(): Robot[] {
    if (!this.simulator) return [];
    return this.simulator.getRobots?.() || [];
  }

  getFleetStatus(): FleetStatus {
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

  getEmitter(): EventEmitter {
    if (this.simulator?.fleetEmitter) {
      return this.simulator.fleetEmitter;
    }
    return this.emitter;
  }
}

export const robotFleetService = RobotFleetService.getInstance();
