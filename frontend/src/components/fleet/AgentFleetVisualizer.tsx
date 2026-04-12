import React from 'react';
import { cn } from '../../lib/utils';
import { 
  Bot, ArrowRight, Coins, Brain, Activity,
  Loader2, Send
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  role: string;
  color: string;
  x: number;
  y: number;
  status?: string;
}

interface Payment {
  from: string;
  to: string;
  amount: number;
  status: 'pending' | 'confirmed';
}

interface RobotData {
  id: string;
  name: string;
  type: string;
  status: string;
  earnings?: string;
}

interface AgentFleetVisualizerProps {
  className?: string;
  robots?: RobotData[];
  payments?: Payment[];
}

const AGENT_COLORS: Record<string, string> = {
  'risk': '#ef4444',
  'market': '#f97316',
  'yield': '#22c55e',
  'execute': '#3b82f6',
  'security': '#a855f7',
  'oracle': '#eab308',
  'sentinel': '#06b6d4',
  'bridge': '#ec4899',
  'default': '#6b7280',
};

const getAgentColor = (name?: string): string => {
  if (!name) return AGENT_COLORS.default;
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(AGENT_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return AGENT_COLORS.default;
};

const calculatePositions = (count: number): { x: number; y: number }[] => {
  const positions: { x: number; y: number }[] = [];
  const radius = 70;
  for (let i = 0; i < count; i++) {
    const angle = (i * 2 * Math.PI) / count - Math.PI / 2;
    positions.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }
  return positions;
};

const AgentFleetVisualizer: React.FC<AgentFleetVisualizerProps> = ({ 
  className,
  robots = [],
  payments = [],
}) => {
  const positions = calculatePositions(robots.length || 6);
  
  const agents: Agent[] = robots.length > 0 
    ? robots.map((robot, i) => ({
        id: robot.id,
        name: robot.name,
        role: robot.type,
        color: getAgentColor(robot.name),
        x: positions[i]?.x || 0,
        y: positions[i]?.y || 0,
        status: robot.status,
      }))
    : [];

  const activePayment = payments.length > 0 ? payments[payments.length - 1] : null;

  const getAgentPosition = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent ? { x: agent.x, y: agent.y } : { x: 0, y: 0 };
  };

  return (
    <div className={cn('relative w-full aspect-square max-w-md mx-auto', className)}>
      {/* Background grid */}
      <div className="absolute inset-0 opacity-20">
        <div className="w-full h-full" style={{
          backgroundImage: `radial-gradient(circle, rgba(74,222,128,0.3) 1px, transparent 1px)`,
          backgroundSize: '20px 20px'
        }} />
      </div>

      {/* Central hub */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-tether-teal/30 to-cyan-500/30 border-2 border-tether-teal/50 flex items-center justify-center backdrop-blur-sm">
            <Brain className="w-7 h-7 text-tether-teal" />
          </div>
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-tether-teal uppercase tracking-wider whitespace-nowrap">
            Orchestrator
          </div>
        </div>
      </div>

      {/* X402 Payment animation */}
      {activePayment && (
        <svg 
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 10 }}
        >
          <defs>
            <linearGradient id="paymentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#4ade80" stopOpacity="1" />
            </linearGradient>
          </defs>
          <circle 
            cx="50%" 
            cy="50%" 
            r="60" 
            fill="none" 
            stroke="url(#paymentGradient)"
            strokeWidth="2"
            strokeDasharray="8 4"
            className="animate-spin"
            style={{ transformOrigin: 'center', animationDuration: '2s' }}
          />
        </svg>
      )}

      {/* Agents */}
      {agents.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-neutral-gray text-xs">
            <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />
            Waiting for fleet data...
          </div>
        </div>
      ) : agents.map((agent) => {
        const pos = getAgentPosition(agent.id);
        const isActive = agent.status === 'active' || agent.status === 'Active';
        const isPaymentActive = activePayment && 
          (activePayment.from === agent.id || activePayment.to === agent.id);
        
        return (
          <div
            key={agent.id}
            className="absolute transition-all duration-500"
            style={{
              left: `calc(50% + ${pos.x}px - 32px)`,
              top: `calc(50% + ${pos.y}px - 32px)`,
            }}
          >
            <div className={cn(
              'relative w-16 h-16 rounded-xl border-2 flex items-center justify-center transition-all duration-300',
              isPaymentActive 
                ? 'scale-110 shadow-lg shadow-green-500/50' 
                : 'hover:scale-105'
            )}
            style={{
              backgroundColor: `${agent.color}15`,
              borderColor: isPaymentActive ? agent.color : `${agent.color}50`,
            }}
            >
              {/* Status indicator */}
              <div className={cn(
                'absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-black',
                isActive ? 'bg-green-500' : 'bg-neutral-gray'
              )}>
                {isActive && <div className="w-full h-full rounded-full bg-green-400 animate-pulse" />}
              </div>
              
              <Bot className="w-6 h-6" style={{ color: agent.color }} />
              
              {/* Payment amount bubble */}
              {activePayment && (
                <div className={cn(
                  'absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[8px] font-bold flex items-center gap-0.5 animate-bounce',
                  activePayment.from === agent.id ? 'bg-red-500/80' : 'bg-green-500/80'
                )}>
                  {activePayment.from === agent.id ? (
                    <>
                      <Send className="w-2 h-2 rotate-180" />
                      {activePayment.amount.toFixed(2)}
                    </>
                  ) : (
                    <>
                      <Coins className="w-2 h-2" />
                      +{activePayment.amount.toFixed(2)}
                    </>
                  )}
                </div>
              )}
            </div>
            
            {/* Agent info */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
              <div className="text-[9px] font-bold text-white uppercase" style={{ color: agent.color }}>
                {agent.name}
              </div>
              <div className="text-[7px] text-neutral-gray">{agent.role}</div>
            </div>
          </div>
        );
      })}

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0">
          <div className="flex flex-wrap justify-center gap-1 p-2">
            {payments.slice(-4).map((p, i) => (
              <div 
                key={i}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[8px]"
              >
                <ArrowRight className="w-2 h-2 text-green-400" />
                <span className="text-neutral-gray">
                  {p.from}→{p.to}
                </span>
                <span className="text-green-400 font-bold">${p.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-0 right-0 text-[8px]">
        <div className="flex items-center gap-1 text-neutral-gray">
          <Activity className="w-3 h-3" />
          <span>X402 Live</span>
        </div>
        <div className="flex items-center gap-1 text-neutral-gray mt-1">
          <Coins className="w-3 h-3" />
          <span>USDT Settlement</span>
        </div>
      </div>
    </div>
  );
};

export default AgentFleetVisualizer;