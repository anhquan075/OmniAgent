import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import {
  RobotFleetPaymentHandler,
  initPaymentHandler,
  getPaymentHandler
} from '../services/robot-fleet/payment-handler';
import { RobotAgent } from '../services/robot-fleet/robot-agent';

dotenv.config({ path: '.env', override: true });

import { getRobotFleetConfig, FleetConfig as FleetConfigType } from '../config/robot-fleet';

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
  agent?: RobotAgent;
  address?: string;
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
let fundingMutex = Promise.resolve();

export function getRecentEvents(): FleetEvent[] {
  return [...recentEvents];
}

export function getRobots(): Robot[] {
  return Array.from(robots.values());
}

export function getFleetStatus() {
  const robotList = Array.from(robots.values()).map(r => ({
    id: r.id,
    type: r.type,
    icon: r.icon,
    status: r.status,
    totalEarned: r.totalEarned,
    taskCount: r.taskCount,
    address: r.address
  }));

  const fleetTotalEarned = robotList.reduce((sum, r) => {
    return sum + parseFloat(r.totalEarned || '0');
  }, 0);

  return {
    enabled: fleetConfig?.enabled || false,
    robots: robotList,
    fleetTotalEarned: fleetTotalEarned.toFixed(2),
    recentEvents: getRecentEvents().slice(-10),
    latestTxHash: getRecentEvents()[0]?.txHash || null,
    latestTxValue: getRecentEvents()[0]?.earnings || null
  };
}

function loadConfig(): FleetConfig {
  fleetConfig = getRobotFleetConfig();
  const config = { ...fleetConfig } as FleetConfig;

  config.rpcUrl = process.env.SEPOLIA_RPC_URL || config.rpcUrl || 'https://ethereum-sepolia.publicnode.com';
  config.privateKey = process.env.PRIVATE_KEY || process.env.ROBOT_FLEET_PRIVATE_KEY || process.env.WDK_SECRET_SEED || config.privateKey;

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

  for (let i = 0; i < fleetConfig.robots.length; i++) {
    const robotConfig = fleetConfig.robots[i];
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

async function initializeRobotAgents(): Promise<void> {
  let index = 0;
  for (const robot of robots.values()) {
    try {
      const agent = new RobotAgent({
        id: robot.id,
        type: robot.type,
        accountIndex: index,
        rpcUrl: fleetConfig.rpcUrl || process.env.SEPOLIA_RPC_URL || ''
      });
      
      await agent.initialize();
      robot.agent = agent;
      robot.address = await agent.getAddress();
      
      logger.info({ 
        robotId: robot.id, 
        address: robot.address 
      }, '[RobotFleet] Robot agent initialized with WDK wallet');
    } catch (error) {
      logger.error({ error, robotId: robot.id }, '[RobotFleet] Failed to initialize robot agent');
    }
    index++;
  }
}

async function fundRobotsWithUsdt(): Promise<void> {
  const startTime = Date.now();
  logger.info('[RobotFleet] Starting USDT funding process...');
  if (!wallet || !provider) {
    logger.warn('[RobotFleet] No wallet, skipping robot funding');
    return;
  }
  
  const usdtAddress = process.env.WDK_USDT_ADDRESS;
  if (!usdtAddress) {
    logger.warn('[RobotFleet] USDT address not configured, skipping funding');
    return;
  }
  
  const USDT_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)'
  ];
  
  const usdt = new ethers.Contract(usdtAddress, USDT_ABI, wallet);
  const fundAmount = ethers.parseUnits('0.5', 6);
  
  const masterBalance = await usdt.balanceOf(wallet.address);
  if (masterBalance < fundAmount) {
    logger.warn({ balance: ethers.formatUnits(masterBalance, 6) }, '[RobotFleet] Master wallet has insufficient USDT, skipping funding');
    return;
  }

  const robotsToFund: Robot[] = [];
  for (const robot of robots.values()) {
    if (!robot.address) continue;
    try {
      const balance = await usdt.balanceOf(robot.address);
      if (balance < fundAmount) {
        robotsToFund.push(robot);
      }
    } catch (e) {
      robotsToFund.push(robot);
    }
  }

  if (robotsToFund.length === 0) {
    logger.info('[RobotFleet] All robots already funded with USDT');
    return;
  }

  logger.info({ count: robotsToFund.length }, '[RobotFleet] Funding robots with USDT');

  let nonce = await provider.getTransactionCount(wallet.address, 'pending');
  let funded = 0;
  let failed = 0;

  for (const robot of robotsToFund) {
    try {
      const tx = await usdt.transfer(robot.address!, fundAmount, { nonce });
      nonce++;
      await tx.wait();
      funded++;
      logger.info({ robotId: robot.id, txHash: tx.hash }, '[RobotFleet] Robot funded');
    } catch (error) {
      failed++;
      logger.error({ error, robotId: robot.id }, '[RobotFleet] Failed to fund robot');
    }
  }

  logger.info({ funded, failed, durationMs: Date.now() - startTime }, '[RobotFleet] USDT funding complete');
}

async function fundRobotsWithEth(): Promise<void> {
  const startTime = Date.now();
  if (!wallet || !provider) {
    logger.warn('[RobotFleet] No wallet, skipping ETH funding');
    return;
  }
  
  const ethAmount = ethers.parseEther('0.005');

  const robotsToFund: Robot[] = [];
  for (const robot of robots.values()) {
    if (!robot.address) continue;
    try {
      const balance = await provider.getBalance(robot.address);
      if (balance < ethAmount) {
        robotsToFund.push(robot);
      }
    } catch (e) {
      robotsToFund.push(robot);
    }
  }

  if (robotsToFund.length === 0) {
    logger.info('[RobotFleet] All robots already funded with ETH');
    return;
  }

  logger.info({ count: robotsToFund.length }, '[RobotFleet] Funding robots with ETH');

  let nonce = await provider.getTransactionCount(wallet.address, 'pending');
  let funded = 0;
  let failed = 0;

  for (const robot of robotsToFund) {
    try {
      const tx = await wallet.sendTransaction({
        to: robot.address!,
        value: ethAmount,
        nonce
      });
      nonce++;
      await tx.wait();
      funded++;
      logger.info({ robotId: robot.id, txHash: tx.hash }, '[RobotFleet] Robot funded with ETH');
    } catch (error) {
      failed++;
      logger.error({ error, robotId: robot.id }, '[RobotFleet] Failed to fund robot with ETH');
    }
  }

  logger.info({ funded, failed, durationMs: Date.now() - startTime }, '[RobotFleet] ETH funding complete');
}

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateEarnings(): string {
  const min = parseFloat(fleetConfig.earningsRange.min);
  const max = parseFloat(fleetConfig.earningsRange.max);
  const earnings = min + Math.random() * (max - min);
  return earnings.toFixed(2);
}

function addEvent(event: FleetEvent): void {
  recentEvents.push(event);
  if (recentEvents.length > MAX_EVENTS) {
    recentEvents.shift();
  }
  fleetEmitter.emit('fleet:event', event);
}

async function ensureRobotFunded(robot: Robot): Promise<void> {
  if (!wallet || !provider || !robot.address) return;
  
  const usdtAddress = process.env.WDK_USDT_ADDRESS;
  if (!usdtAddress) return;
  
  const usdt = new ethers.Contract(usdtAddress, [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)'
  ], wallet);
  
  const minBalance = ethers.parseUnits('0.5', 6);
  const fundAmount = ethers.parseUnits('1', 6);
  
  fundingMutex = fundingMutex.then(async () => {
    try {
      const balance = await usdt.balanceOf(robot.address!);
      if (balance < minBalance) {
        const masterBalance = await usdt.balanceOf(wallet!.address);
        if (masterBalance >= fundAmount) {
          logger.info({ robotId: robot.id, balance: ethers.formatUnits(balance, 6) }, '[RobotFleet] Re-funding robot');
          const tx = await usdt.transfer(robot.address!, fundAmount);
          await tx.wait();
          logger.info({ robotId: robot.id, txHash: tx.hash }, '[RobotFleet] Robot re-funded');
        }
      }
    } catch (error) {
      logger.error({ error, robotId: robot.id }, '[RobotFleet] Failed to re-fund robot');
    }
  });
  
  await fundingMutex;
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
    robot.totalEarned = (currentEarnings + parseFloat(earnings)).toFixed(2);

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

  if (robot.agent) {
    const result = await robot.agent.executeTask({
      taskName,
      earnings,
      robotId: robot.id,
      robotType: robot.type,
      targetAddress
    });
    
    if (result.success) {
      logger.info({ robotId: robot.id, result }, '[RobotFleet] Robot agent task executed');
    }
  }

  if (targetAddress && targetAddress !== '0x0000000000000000000000000000000000000000') {
    if (!robot.agent) {
      logger.warn({ robotId: robot.id }, '[RobotFleet] No robot agent, skipping payment');
      robot.status = 'Idle';
      return;
    }
    await ensureRobotFunded(robot);
    const transferResult = await robot.agent.transferUsdt(targetAddress, earnings);
    if (transferResult.success && transferResult.txHash) {
      finishTask(transferResult.txHash);
    } else {
      logger.warn({ robotId: robot.id, error: transferResult.error }, '[RobotFleet] Skipping earning credit due to failed payment');
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

  await initializeRobotAgents();

  await fundRobotsWithUsdt();
  await fundRobotsWithEth();

  for (const robot of robots.values()) {
    logger.debug({ robotId: robot.id }, '[RobotFleet] Starting tasks');
    startRobotTasks(robot.id);
  }

  logger.info('[RobotFleet] Robot Fleet Simulator running with WDK agents');
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
