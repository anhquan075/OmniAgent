import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { EventEmitter } from 'events';
import { robotFleetConfig as staticFleetConfig, FleetConfig as FleetConfigType } from '../config/robot-fleet';
import { logger } from '../utils/logger';
import {
  RobotFleetPaymentHandler,
  initPaymentHandler,
  getPaymentHandler
} from '../services/robot-fleet/payment-handler';

dotenv.config({ path: '.env', override: true });

interface FleetConfig extends FleetConfigType {
  rpcUrl?: string;
  privateKey?: string;
}

interface Robot {
  id: string;
  type: string;
  icon: string;
  status: 'Working' | 'Idle';
  totalEarned: string;
  taskCount: number;
}

export interface FleetEvent {
  robotId: string;
  type: string;
  icon: string;
  taskName: string;
  earnings: string;
  timestamp: string;
  txHash?: string;
}

let fleetConfig: FleetConfig;
let robots: Map<string, Robot> = new Map();
let recentEvents: FleetEvent[] = [];
let wallet: ethers.Wallet | null = null;
let provider: ethers.JsonRpcProvider | null = null;
let paymentHandler: RobotFleetPaymentHandler | null = null;

export const fleetEmitter = new EventEmitter();

const MAX_EVENTS = 50;

export function getRecentEvents(): FleetEvent[] {
  return [...recentEvents];
}

export function getRobots(): Robot[] {
  return Array.from(robots.values());
}

export function getFleetStatus() {
  const robotList = Array.from(robots.values());
  const fleetTotalEarned = robotList.reduce((sum, r) => {
    return sum + parseFloat(r.totalEarned);
  }, 0);

  return {
    enabled: fleetConfig?.enabled || false,
    robots: robotList,
    fleetTotalEarned: fleetTotalEarned.toFixed(4),
    recentEvents: getRecentEvents().slice(-10)
  };
}

function loadConfig(): FleetConfig {
  let config = { ...staticFleetConfig } as FleetConfig;
  
  const configPath = path.resolve(__dirname, '../../config/robot-fleet.json');
  if (fs.existsSync(configPath)) {
    try {
      const configData = fs.readFileSync(configPath, 'utf-8');
      const jsonConfig = JSON.parse(configData);
      config = { ...config, ...jsonConfig };
    } catch (e) {
      logger.warn('[RobotFleet] Failed to load robot-fleet.json, using static config');
    }
  }

  config.rpcUrl = process.env.BNB_RPC_URL || config.rpcUrl || 'https://bsc-testnet.public.blastapi.io';
  config.privateKey = process.env.PRIVATE_KEY || process.env.ROBOT_FLEET_PRIVATE_KEY || process.env.WDK_SECRET_SEED || config.privateKey;
  
  if (!config.agentWalletAddress) {
    config.agentWalletAddress = "0x26CEefE4F0C3558237016F213914764047f671bA";
  }

  return config;
}

function initializeWallet(): void {
  let privateKey = fleetConfig.privateKey;
  const rpcUrl = fleetConfig.rpcUrl!;

  if (privateKey) {
    privateKey = privateKey.trim().replace(/^["']|["']$/g, '');
  }

  if (!privateKey) {
    logger.error('[RobotFleet] CRITICAL: No ROBOT_FLEET_PRIVATE_KEY or WDK_SECRET_SEED found');
    logger.error('[RobotFleet] Real transactions are required. Simulator will not process tasks.');
    return;
  }

  try {
    provider = new ethers.JsonRpcProvider(rpcUrl);
    
    if (privateKey.startsWith('0x')) {
      wallet = new ethers.Wallet(privateKey, provider);
    } else if (privateKey.split(' ').length >= 12) {
      const hdNode = ethers.Wallet.fromPhrase(privateKey, provider);
      wallet = new ethers.Wallet(hdNode.privateKey, provider);
    } else if (/^[0-9a-fA-F]{64}$/.test(privateKey.trim())) {
      // Handle private key without 0x prefix (64 hex characters)
      wallet = new ethers.Wallet('0x' + privateKey.trim(), provider);
    } else {
      logger.error('[RobotFleet] Invalid private key format');
      return;
    }

    if (wallet && provider) {
      logger.info({ address: wallet.address }, '[RobotFleet] Wallet initialized');
      paymentHandler = initPaymentHandler(wallet, provider);
      logger.info('[RobotFleet] Payment handler initialized');
    }
  } catch (error) {
    logger.error(error, '[RobotFleet] Failed to initialize wallet');
    wallet = null;
    provider = null;
    paymentHandler = null;
  }
}

function spawnFleet(): void {
  robots.clear();
  
  if (!fleetConfig.robots) return;

  for (const robotConfig of fleetConfig.robots) {
    const robot: Robot = {
      id: robotConfig.id,
      type: robotConfig.type,
      icon: robotConfig.icon || '',
      status: 'Idle',
      totalEarned: '0.0000',
      taskCount: 0
    };
    robots.set(robot.id, robot);
    logger.info({ type: robot.type, id: robot.id, icon: robot.icon }, '[RobotFleet] Spawned Robot');
  }
}

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateEarnings(): string {
  const min = parseFloat(fleetConfig.earningsRange.min);
  const max = parseFloat(fleetConfig.earningsRange.max);
  const earnings = min + Math.random() * (max - min);
  return earnings.toFixed(4);
}

async function sendPayment(amount: string, toAddress: string): Promise<string | null> {
  if (!paymentHandler) {
    logger.warn('[RobotFleet] Payment handler not initialized, skipping payment');
    return null;
  }

  try {
    logger.info({ amount, to: toAddress }, '[RobotFleet] Sending payment via handler');
    
    const result = await paymentHandler.sendPayment(amount, toAddress);
    
    logger.info(
      { hash: result.hash, status: result.status },
      '[RobotFleet] Payment submitted'
    );

    if (result.status === 'already_known') {
      logger.info(
        { hash: result.hash },
        '[RobotFleet] Transaction already in mempool, using existing tx'
      );
    }

    return result.hash;
  } catch (error: any) {
    logger.error(error, '[RobotFleet] Payment failed');
    return null;
  }
}

function addEvent(event: FleetEvent): void {
  recentEvents.push(event);
  if (recentEvents.length > MAX_EVENTS) {
    recentEvents.shift();
  }
  fleetEmitter.emit('fleet:event', event);
}

async function completeTask(robotId: string): Promise<void> {
  const robot = robots.get(robotId);
  if (!robot) return;

  robot.status = 'Working';
  robot.taskCount++;

  const earnings = generateEarnings();
  const taskName = `${robot.type} Task #${robot.taskCount}`;
  
  logger.info({ robotId: robot.id, taskName, earnings }, '[RobotFleet] Task completed');

  let txHash: string | undefined;
  const targetAddress = fleetConfig.agentWalletAddress || (wallet ? wallet.address : '0x0000000000000000000000000000000000000000');
  
  const finishTask = (hash: string) => {
    txHash = hash;
    const currentEarnings = parseFloat(robot.totalEarned);
    robot.totalEarned = (currentEarnings + parseFloat(earnings)).toFixed(4);

    const event: FleetEvent = {
      robotId: robot.id,
      type: robot.type,
      icon: robot.icon,
      taskName,
      earnings,
      timestamp: new Date().toISOString(),
      txHash
    };

    addEvent(event);
    logger.debug({ event }, '[RobotFleet] Event emitted');

    setTimeout(() => {
      robot.status = 'Idle';
    }, 2000);
  };

  if (targetAddress && targetAddress !== '0x0000000000000000000000000000000000000000') {
    const hash = await sendPayment(earnings, targetAddress);
    if (hash) {
      finishTask(hash);
    } else {
      logger.warn({ robotId: robot.id }, '[RobotFleet] Skipping earning credit due to failed/skipped payment');
      robot.status = 'Idle';
    }
  } else {
    logger.error('[RobotFleet] No target address for payment, skipping task credit');
    robot.status = 'Idle';
  }
}

function startRobotTasks(robotId: string): void {
  const scheduleNext = () => {
    const robot = robots.get(robotId);
    if (!robot) return;

    const delay = randomInRange(fleetConfig.taskInterval.min, fleetConfig.taskInterval.max);
    
    setTimeout(async () => {
      await completeTask(robotId);
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

export async function startSimulator(): Promise<void> {
  logger.info('[RobotFleet] Robot Fleet Simulator Starting');

  fleetConfig = loadConfig();
  
  if (!fleetConfig.enabled) {
    logger.info('[RobotFleet] Fleet disabled in config');
    return;
  }

  logger.info({ fleetSize: fleetConfig.fleetSize }, '[RobotFleet] Config loaded');
  
  if (fleetConfig.rpcUrl) {
    logger.debug({ rpcUrl: fleetConfig.rpcUrl }, '[RobotFleet] RPC URL');
  }

  initializeWallet();

  spawnFleet();

  for (const robot of robots.values()) {
    logger.debug({ robotId: robot.id }, '[RobotFleet] Starting tasks');
    startRobotTasks(robot.id);
  }

  logger.info('[RobotFleet] Robot Fleet Simulator running');
}

async function main(): Promise<void> {
  await startSimulator();

  process.on('SIGINT', () => {
    logger.info({ totalEarned: getFleetStatus().fleetTotalEarned }, '[RobotFleet] Shutting down Simulator');
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch((error) => {
    logger.error(error, '[RobotFleet] Fatal error');
    process.exit(1);
  });
}

export { robots, recentEvents, fleetConfig };
