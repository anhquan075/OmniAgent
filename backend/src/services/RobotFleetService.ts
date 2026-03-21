import { logger } from '@/utils/logger';
import { EventEmitter } from 'events';
import * as simulator from '@/scripts/robot-simulator';

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
  latestTxHash?: string | null;
  latestTxValue?: string | null;
}

class RobotFleetService {
  private static instance: RobotFleetService;
  public emitter: EventEmitter;
  private simulator: any = simulator;
  private isRunning: boolean = false;

  private constructor() {
    this.emitter = new EventEmitter();
    if (this.simulator && typeof this.simulator.startSimulator === 'function') {
      logger.info('[RobotFleetService] Simulator module loaded statically');
    } else {
      logger.warn('[RobotFleetService] Simulator module missing startSimulator');
    }
  }

  public async startSimulator(): Promise<void> {
    if (!this.simulator || typeof this.simulator.startSimulator !== 'function') {
      throw new Error('Simulator not loaded or startSimulator function not available');
    }
    if (this.isRunning) {
      logger.debug('[RobotFleetService] Simulator already running');
      return;
    }
    logger.info('[RobotFleetService] Starting simulator');
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

  getEmitter(): EventEmitter {
    if (this.simulator?.fleetEmitter) {
      return this.simulator.fleetEmitter;
    }
    return this.emitter;
  }
}

export const robotFleetService = RobotFleetService.getInstance();
