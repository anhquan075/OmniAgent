import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';

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
    this.init();
  }

  private async init() {
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
            logger.info({ path: p }, '[RobotFleetService] Simulator module loaded');
            break;
          }
        } catch (e) {
        }
      }

      if (!this.simulator || typeof this.simulator.startSimulator !== 'function') {
        for (const p of paths) {
          try {
            const mod = require(p);
            this.simulator = mod.default || mod;
            if (this.simulator && typeof this.simulator.startSimulator === 'function') {
              logger.info({ path: p }, '[RobotFleetService] Simulator module loaded via require');
              break;
            }
          } catch (e) {
          }
        }
      }

      if (this.simulator) {
        logger.info('[RobotFleetService] Simulator module initialized');
      } else {
        logger.warn('[RobotFleetService] Simulator module not found in any search path');
      }
    } catch (error: any) {
      logger.error(error, '[RobotFleetService] Error during simulator initialization');
    }
  }

  public async startSimulator(): Promise<void> {
    if (!this.simulator) {
      await this.init();
    }

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
