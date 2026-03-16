import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { EventEmitter } from 'events';

// Load environment
const envPath = path.resolve(__dirname, '../.env.wdk');
dotenv.config({ path: envPath });
dotenv.config(); // Fallback to .env

import { robotFleetConfig as staticFleetConfig, FleetConfig as FleetConfigType } from '../src/config/robot-fleet';

// Types
interface FleetConfig extends FleetConfigType {
  rpcUrl?: string;
  privateKey?: string;
}

// ... existing code ...

// Load configuration
function loadConfig(): FleetConfig {
  const config = { ...staticFleetConfig } as FleetConfig;

  // Use env vars or config values
  config.rpcUrl = process.env.BNB_RPC_URL || config.rpcUrl || 'https://bsc-testnet.public.blastapi.io';
  config.privateKey = process.env.PRIVATE_KEY || process.env.ROBOT_FLEET_PRIVATE_KEY || process.env.WDK_SECRET_SEED || config.privateKey;
  
  // Extract agent wallet address from env if not in config
  if (!config.agentWalletAddress) {
    config.agentWalletAddress = "0xA4c009f0541d9C7f86F12cF4470Faf60448B240B";
  }

  return config;
}

interface FleetConfig {
  enabled: boolean;
  fleetSize: number;
  robots: RobotConfig[];
  taskInterval: { min: number; max: number };
  earningsRange: { min: string; max: string };
  agentWalletAddress: string;
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

interface FleetEvent {
  robotId: string;
  type: string;
  icon: string;
  taskName: string;
  earnings: string;
  timestamp: string;
  txHash?: string;
}

// Global state
let fleetConfig: FleetConfig;
let robots: Map<string, Robot> = new Map();
let recentEvents: FleetEvent[] = [];
let wallet: ethers.Wallet | null = null;
let provider: ethers.JsonRpcProvider | null = null;

// Event emitter for real-time updates
export const fleetEmitter = new EventEmitter();

// Event storage (for SSE consumption)
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
    enabled: fleetConfig.enabled,
    robots: robotList,
    fleetTotalEarned: fleetTotalEarned.toFixed(4),
    recentEvents: getRecentEvents().slice(-10)
  };
}

// Load configuration
function loadConfig(): FleetConfig {
  const configPath = path.resolve(__dirname, '../config/robot-fleet.json');
  const configData = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configData) as FleetConfig;

  // Use env vars or config values
  config.rpcUrl = process.env.BNB_RPC_URL || config.rpcUrl || 'https://bsc-testnet.public.blastapi.io';
  config.privateKey = process.env.PRIVATE_KEY || process.env.ROBOT_FLEET_PRIVATE_KEY || process.env.WDK_SECRET_SEED || config.privateKey;
  
  // Extract agent wallet address from env if not in config
  if (!config.agentWalletAddress) {
    config.agentWalletAddress = "0xA4c009f0541d9C7f86F12cF4470Faf60448B240B";
  }

  return config;
}

// Initialize wallet
function initializeWallet(): void {
  const privateKey = fleetConfig.privateKey;
  const rpcUrl = fleetConfig.rpcUrl!;

  if (!privateKey) {
    console.warn('[RobotFleet] No ROBOT_FLEET_PRIVATE_KEY or WDK_SECRET_SEED found');
    console.warn('[RobotFleet] Will generate events but skip actual payments');
    return;
  }

  try {
    provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Handle both hex private key and mnemonic
    if (privateKey.startsWith('0x')) {
      wallet = new ethers.Wallet(privateKey, provider);
    } else if (privateKey.split(' ').length >= 12) {
      // Mnemonic phrase
      const hdNode = ethers.HDNodeWallet.fromPhrase(privateKey);
      wallet = new ethers.Wallet(hdNode.privateKey, provider);
    } else {
      console.error('[RobotFleet] Invalid private key format');
      return;
    }

    console.log(`[RobotFleet] Wallet initialized: ${wallet.address}`);
  } catch (error) {
    console.error('[RobotFleet] Failed to initialize wallet:', error);
    wallet = null;
  }
}

// Initialize fleet
function spawnFleet(): void {
  robots.clear();
  
  for (const robotConfig of fleetConfig.robots) {
    const robot: Robot = {
      id: robotConfig.id,
      type: robotConfig.type,
      icon: robotConfig.icon,
      status: 'Idle',
      totalEarned: '0.0000',
      taskCount: 0
    };
    robots.set(robot.id, robot);
    console.log(`[RobotFleet] Spawned [${robot.icon}] ${robot.type} Robot ${robot.id}`);
  }
}

// Random number helper
function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate random earnings
function generateEarnings(): string {
  const min = parseFloat(fleetConfig.earningsRange.min);
  const max = parseFloat(fleetConfig.earningsRange.max);
  const earnings = min + Math.random() * (max - min);
  return earnings.toFixed(4);
}

// Payment executor
async function sendPayment(amount: string, toAddress: string): Promise<string | null> {
  if (!wallet || !provider) {
    console.warn('[RobotFleet] Wallet not initialized, skipping payment');
    return null;
  }

  try {
    const amountWei = ethers.parseEther(amount);
    
    // Check balance
    const balance = await wallet.provider!.getBalance(wallet.address);
    if (balance < amountWei) {
      console.warn(`[RobotFleet] Insufficient balance: ${ethers.formatEther(balance)} ETH`);
      return null;
    }

    console.log(`[RobotFleet] Sending ${amount} ETH to ${toAddress}...`);
    
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: amountWei,
      gasLimit: 21000n
    });

    console.log(`[RobotFleet] Transaction sent: ${tx.hash}`);
    
    // Don't wait for confirmation to avoid blocking
    tx.wait().then(() => {
      console.log(`[RobotFleet] Transaction confirmed: ${tx.hash}`);
    }).catch((err) => {
      console.error(`[RobotFleet] Transaction failed: ${err.message}`);
    });

    return tx.hash;
  } catch (error: any) {
    console.error('[RobotFleet] Payment failed:', error.message);
    return null;
  }
}

// Add event to history
function addEvent(event: FleetEvent): void {
  recentEvents.push(event);
  if (recentEvents.length > MAX_EVENTS) {
    recentEvents.shift();
  }
  fleetEmitter.emit('fleet:event', event);
}

// Complete a task for a robot
function completeTask(robotId: string): Promise<void> {
  const robot = robots.get(robotId);
  if (!robot) return Promise.resolve();

  robot.status = 'Working';
  robot.taskCount++;

  const earnings = generateEarnings();
  const taskName = `${robot.type} Task #${robot.taskCount}`;
  
  console.log(`\n[RobotFleet] [${robot.icon}] Robot ${robot.id} completed ${taskName}`);
  console.log(`[RobotFleet] Earnings: ${earnings} ETH`);

  // Send payment if wallet is available
  let txHash: string | undefined;
  const targetAddress = fleetConfig.agentWalletAddress || (wallet ? wallet.address : '0x0000000000000000000000000000000000000000');
  
  const finishTask = (hash?: string) => {
    txHash = hash;
    // Update robot earnings
    const currentEarnings = parseFloat(robot.totalEarned);
    robot.totalEarned = (currentEarnings + parseFloat(earnings)).toFixed(4);

    // Create event
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
    console.log(`[RobotFleet] Event emitted: ${JSON.stringify(event)}`);

    // Set robot back to Idle after task
    setTimeout(() => {
      robot.status = 'Idle';
    }, 2000);
  };

  if (targetAddress && targetAddress !== '0x0000000000000000000000000000000000000000') {
    return sendPayment(earnings, targetAddress).then((hash) => finishTask(hash || undefined));
  } else {
    finishTask();
    return Promise.resolve();
  }
}

// Start tasks for a robot
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
  console.log('🤖 Robot Fleet Simulator Starting...\n');

  // Load config
  fleetConfig = loadConfig();
  
  if (!fleetConfig.enabled) {
    console.log('[RobotFleet] Fleet disabled in config');
    return;
  }

  console.log(`[RobotFleet] Config loaded: ${fleetConfig.fleetSize} robots`);
  console.log(`[RobotFleet] Task interval: ${fleetConfig.taskInterval.min}-${fleetConfig.taskInterval.max}ms`);
  console.log(`[RobotFleet] Earnings range: ${fleetConfig.earningsRange.min}-${fleetConfig.earningsRange.max} ETH`);
  
  if (fleetConfig.rpcUrl) {
    console.log(`[RobotFleet] RPC URL: ${fleetConfig.rpcUrl}`);
  }

  // Initialize wallet
  initializeWallet();

  // Spawn fleet
  spawnFleet();

  // Start tasks for each robot
  for (const robot of robots.values()) {
    console.log(`[RobotFleet] Starting tasks for [${robot.icon}] Robot ${robot.id}`);
    startRobotTasks(robot.id);
  }

  console.log('\n✅ Robot Fleet Simulator running...');
}

async function main(): Promise<void> {
  await startSimulator();
  console.log('Press Ctrl+C to stop\n');

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down Robot Fleet Simulator...');
    console.log(`Final fleet earnings: ${getFleetStatus().fleetTotalEarned} ETH`);
    process.exit(0);
  });
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('[RobotFleet] Fatal error:', error);
    process.exit(1);
  });
}

// Export for API consumption
export { robots, recentEvents, fleetConfig };
