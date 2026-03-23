export interface RobotConfig {
  id: string;
  type: string;
  icon: string;
  capabilities?: string[];
  x402Endpoints?: string[];
  chain?: 'sepolia' | 'hashkey';
}

export interface FleetConfig {
  enabled: boolean;
  fleetSize: number;
  robots: RobotConfig[];
  taskInterval: { min: number; max: number };
  earningsRange: { min: string; max: string };
  minTransferThreshold: number;
  agentWalletAddress: string;
  useWdkAgents: boolean;
  x402Enabled: boolean;
  hashkeyEnabled?: boolean;
}

const DEFAULT_ROBOTS: RobotConfig[] = [
  { "id": "ROBO-001", "type": "Yield Sentry", "icon": "[S]", chain: "sepolia" },
  { "id": "ROBO-002", "type": "Liquidity Scout", "icon": "[L]", chain: "sepolia" },
  { "id": "ROBO-005", "type": "HSK Staker", "icon": "[K]", chain: "hashkey" },
  { "id": "ROBO-006", "type": "HashKey Vault Agent", "icon": "[V]", chain: "hashkey" },
  { "id": "ROBO-007", "type": "HSK Staker Pro", "icon": "[K+]", chain: "hashkey" },
  { "id": "ROBO-008", "type": "HashKey Yield Harvester", "icon": "[Y]", chain: "hashkey" }
];

function parseRobots(): RobotConfig[] {
  const envRobots = process.env.ROBOT_FLEET_ROBOTS;
  if (envRobots) {
    try {
      const parsed = JSON.parse(envRobots);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  return DEFAULT_ROBOTS;
}

export function getRobotFleetConfig(): FleetConfig {
  const robots = parseRobots();
  const hashkeyEnabled = process.env.ROBOT_FLEET_HASHKEY_ENABLED === 'true';
  return {
    enabled: process.env.ROBOT_FLEET_ENABLED === 'true',
    fleetSize: parseInt(process.env.ROBOT_FLEET_SIZE || String(robots.length), 10),
    robots,
    taskInterval: {
      min: parseInt(process.env.ROBOT_FLEET_TASK_INTERVAL_MIN || '5000', 10),
      max: parseInt(process.env.ROBOT_FLEET_TASK_INTERVAL_MAX || '15000', 10),
    },
    earningsRange: {
      min: process.env.ROBOT_FLEET_EARNINGS_MIN || '0.1',
      max: process.env.ROBOT_FLEET_EARNINGS_MAX || '0.5',
    },
    minTransferThreshold: parseFloat(process.env.ROBOT_FLEET_MIN_TRANSFER_THRESHOLD || '1.0'),
    agentWalletAddress: process.env.ROBOT_FLEET_AGENT_WALLET || '',
    useWdkAgents: process.env.ROBOT_FLEET_USE_WDK_AGENTS === 'true',
    x402Enabled: process.env.ROBOT_FLEET_X402_ENABLED !== 'false',
    hashkeyEnabled,
  };
}
