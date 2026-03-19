export interface RobotConfig {
  id: string;
  type: string;
  icon: string;
}

export interface FleetConfig {
  enabled: boolean;
  fleetSize: number;
  robots: RobotConfig[];
  taskInterval: { min: number; max: number };
  earningsRange: { min: string; max: string };
  agentWalletAddress: string;
}

const DEFAULT_ROBOTS: RobotConfig[] = [
  { "id": "ROBO-001", "type": "Yield Sentry", "icon": "[S]" },
  { "id": "ROBO-002", "type": "Liquidity Scout", "icon": "[L]" },
  { "id": "ROBO-003", "type": "Flash Arbiter", "icon": "[A]" },
  { "id": "ROBO-004", "type": "Peg Guardian", "icon": "[G]" },
  { "id": "ROBO-005", "type": "Risk Oracle", "icon": "[O]" },
  { "id": "ROBO-006", "type": "Delta Neutral", "icon": "[D]" },
  { "id": "ROBO-007", "type": "MEV Shield", "icon": "[M]" },
  { "id": "ROBO-008", "type": "Bounty Hunter", "icon": "[B]" }
];

function parseRobots(): RobotConfig[] {
  const env = process.env.ROBOT_FLEET_ROBOTS;
  if (!env) return DEFAULT_ROBOTS;
  try {
    const parsed = JSON.parse(env);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return DEFAULT_ROBOTS;
}

export const robotFleetConfig: FleetConfig = {
  enabled: process.env.ROBOT_FLEET_ENABLED === 'true',
  fleetSize: parseInt(process.env.ROBOT_FLEET_SIZE || '8', 10),
  robots: parseRobots(),
  taskInterval: {
    min: parseInt(process.env.ROBOT_FLEET_TASK_INTERVAL_MIN || '5000', 10),
    max: parseInt(process.env.ROBOT_FLEET_TASK_INTERVAL_MAX || '15000', 10),
  },
  earningsRange: {
    min: process.env.ROBOT_FLEET_EARNINGS_MIN || '0.0001',
    max: process.env.ROBOT_FLEET_EARNINGS_MAX || '0.0025',
  },
  agentWalletAddress: process.env.ROBOT_FLEET_AGENT_WALLET || '',
};
