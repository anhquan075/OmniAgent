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

export const robotFleetConfig: FleetConfig = {
  "enabled": true,
  "fleetSize": 8,
  "robots": [
    { "id": "ROBO-001", "type": "Yield Sentry", "icon": "🛡️" },
    { "id": "ROBO-002", "type": "Liquidity Scout", "icon": "📡" },
    { "id": "ROBO-003", "type": "Flash Arbiter", "icon": "⚡" },
    { "id": "ROBO-004", "type": "Peg Guardian", "icon": "⚖️" },
    { "id": "ROBO-005", "type": "Risk Oracle", "icon": "🔮" },
    { "id": "ROBO-006", "type": "Delta Neutral", "icon": "🌊" },
    { "id": "ROBO-007", "type": "MEV Shield", "icon": "🛡️" },
    { "id": "ROBO-008", "type": "Bounty Hunter", "icon": "💰" }
  ],
  "taskInterval": { "min": 5000, "max": 15000 },
  "earningsRange": { "min": "0.0001", "max": "0.0025" },
  "agentWalletAddress": ""
};
