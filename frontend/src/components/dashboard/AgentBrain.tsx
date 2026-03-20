import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Shield, Activity, Zap, Calculator, TrendingUp, Cpu, Lock, CheckCircle2, ExternalLink, BrainCircuit, ShieldAlert, Coins, BarChart3, Layers, Clock, UserCheck } from 'lucide-react';
import { useAccount } from 'wagmi';
import { BLOCK_EXPLORERS } from '@/lib/networkConfig';

interface AgentBrainProps {
  stats?: any;
}

export default function AgentBrain({ stats }: AgentBrainProps) {
  const { isConnected } = useAccount();

  const getRiskColor = (drawdown: number) => {
    if (drawdown >= 2000) return 'text-red-500 bg-red-500/10 border-red-500/20';
    if (drawdown >= 1000) return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
    return 'text-tether-teal bg-tether-teal/10 border-tether-teal/20';
  };

  const currentRisk = stats?.risk?.drawdownBps >= 1000 ? 'HIGH' : 'LOW';

  const anomalyStats = stats?.anomalyDetection || {};
  const governanceStats = stats?.governance || {};
  const paymentStats = stats?.payment || {};
  const adaptiveStats = stats?.adaptive || {};

  return (
    <div className="flex flex-col gap-4">
      {/* Statistical Anomaly Detection */}
      <Card className="glass shadow-2xl border-cyber-purple/20 overflow-hidden group relative">
        <CardHeader className="pb-2 border-b border-white/5 bg-cyber-purple/5">
          <CardTitle className="flex items-center gap-2 text-white text-[10px] font-heading font-bold uppercase tracking-[0.2em]">
            <BarChart3 className="w-4 h-4 text-cyber-purple shadow-glow-sm" />
            Anomaly Detection
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 rounded-lg bg-white/5 border border-white/5">
              <span className="text-[7px] font-heading text-neutral-gray uppercase tracking-widest">Checked</span>
              <p className="text-sm font-mono text-white">{anomalyStats.totalChecked || 0}</p>
            </div>
            <div className="p-2 rounded-lg bg-white/5 border border-white/5">
              <span className="text-[7px] font-heading text-neutral-gray uppercase tracking-widest">Anomalies</span>
              <p className="text-sm font-mono text-cyber-purple">{anomalyStats.anomaliesDetected || 0}</p>
            </div>
            <div className="p-2 rounded-lg bg-white/5 border border-white/5">
              <span className="text-[7px] font-heading text-neutral-gray uppercase tracking-widest">Last Z-Score</span>
              <p className="text-sm font-mono text-white">{anomalyStats.lastZScore?.toFixed(2) || '—'}</p>
            </div>
            <div className="p-2 rounded-lg bg-white/5 border border-white/5">
              <span className="text-[7px] font-heading text-neutral-gray uppercase tracking-widest">Mode</span>
              <p className="text-sm font-mono text-tether-teal">{anomalyStats.coldStartMode ? 'Cold' : 'Warm'}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[7px]">
            <div className={`w-1.5 h-1.5 rounded-full ${anomalyStats.coldStartMode ? 'bg-yellow-500 animate-pulse' : 'bg-neon-green animate-pulse'}`}></div>
            <span className="text-neutral-gray uppercase tracking-wider">
              {anomalyStats.coldStartMode ? 'Insufficient history - using conservative thresholds' : 'Z/IQR anomaly detection active'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 4-Layer Governance Pipeline */}
      <Card className="glass shadow-2xl border-neon-green/20 overflow-hidden group relative">
        <CardHeader className="pb-2 border-b border-white/5 bg-neon-green/5">
          <CardTitle className="flex items-center gap-2 text-white text-[10px] font-heading font-bold uppercase tracking-[0.2em]">
            <Layers className="w-4 h-4 text-neon-green shadow-glow-sm" />
            Governance Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
              <div className="w-6 h-6 rounded-full bg-tether-teal/20 flex items-center justify-center text-[8px] font-bold text-tether-teal">1</div>
              <span className="text-[9px] text-white flex-1">Hard Rules</span>
              <CheckCircleIcon className="w-3 h-3 text-neon-green" />
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
              <div className="w-6 h-6 rounded-full bg-cyber-purple/20 flex items-center justify-center text-[8px] font-bold text-cyber-purple">2</div>
              <span className="text-[9px] text-white flex-1">Statistical Anomaly (Z/IQR)</span>
              <CheckCircleIcon className="w-3 h-3 text-neon-green" />
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
              <div className="w-6 h-6 rounded-full bg-cyber-blue/20 flex items-center justify-center text-[8px] font-bold text-cyber-blue">3</div>
              <span className="text-[9px] text-white flex-1">AI Interpretation</span>
              <CheckCircleIcon className="w-3 h-3 text-neon-green" />
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
              <div className="w-6 h-6 rounded-full bg-xaut-gold/20 flex items-center justify-center text-[8px] font-bold text-xaut-gold">4</div>
              <span className="text-[9px] text-white flex-1">Human Approval</span>
              <CheckCircleIcon className="w-3 h-3 text-neon-green" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="p-1.5 rounded bg-neon-green/10 border border-neon-green/20">
              <p className="text-[10px] font-mono text-neon-green">{governanceStats.autoApproved || 0}</p>
              <span className="text-[6px] text-neutral-gray uppercase">Auto-Approve</span>
            </div>
            <div className="p-1.5 rounded bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-[10px] font-mono text-yellow-500">{governanceStats.flaggedForReview || 0}</p>
              <span className="text-[6px] text-neutral-gray uppercase">Flagged</span>
            </div>
            <div className="p-1.5 rounded bg-red-500/10 border border-red-500/20">
              <p className="text-[10px] font-mono text-red-500">{governanceStats.rejected || 0}</p>
              <span className="text-[6px] text-neutral-gray uppercase">Rejected</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Tier & Scheduler */}
      <Card className="glass shadow-2xl border-cyber-cyan/20 overflow-hidden group relative">
        <CardHeader className="pb-2 border-b border-white/5 bg-cyber-cyan/5">
          <CardTitle className="flex items-center gap-2 text-white text-[10px] font-heading font-bold uppercase tracking-[0.2em]">
            <Coins className="w-4 h-4 text-cyber-cyan shadow-glow-sm" />
            Payment & Scheduler
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 rounded-lg bg-white/5 border border-white/5">
              <span className="text-[7px] font-heading text-neutral-gray uppercase tracking-widest">Access Tier</span>
              <p className="text-sm font-mono text-cyber-cyan capitalize">{paymentStats.tier || 'anonymous'}</p>
            </div>
            <div className="p-2 rounded-lg bg-white/5 border border-white/5">
              <span className="text-[7px] font-heading text-neutral-gray uppercase tracking-widest">x402 Revenue</span>
              <p className="text-sm font-mono text-white">{stats?.x402Revenue || '0.00'}</p>
            </div>
            <div className="p-2 rounded-lg bg-white/5 border border-white/5 col-span-2">
              <span className="text-[7px] font-heading text-neutral-gray uppercase tracking-widest">Adaptive Polling</span>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="w-3 h-3 text-tether-teal" />
                <p className="text-xs font-mono text-white">
                  {adaptiveStats.stateSummary?.isHealthy ? 'Active' : 'Paused'}
                </p>
                <Badge variant="outline" className={`text-[6px] py-0 ${adaptiveStats.stateSummary?.isHealthy ? 'border-neon-green/30 text-neon-green' : 'border-red-500/30 text-red-500'}`}>
                  {adaptiveStats.stateSummary?.isHealthy ? 'Healthy' : 'Unhealthy'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent Reasoning */}
      <Card className="glass shadow-2xl border-white/10 relative overflow-hidden flex flex-col">
        <CardHeader className="pb-2 border-b border-white/5">
          <CardTitle className="flex items-center gap-2 text-neutral-gray-light text-[10px] font-heading font-bold uppercase tracking-[0.2em]">
            <BrainCircuit className="w-4 h-4 text-tether-teal animate-pulse" />
            Agent Reasoning
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 flex-1 flex flex-col">
           <div className="p-4 rounded-xl bg-white/5 border border-white/5 relative group">
              <div className="absolute -left-1 top-4 w-1 h-8 bg-tether-teal rounded-full shadow-glow-sm"></div>
              <p className="text-[11px] text-white leading-relaxed font-mono italic opacity-90">
                "{stats?.lastReasoning || "Strategist is idling. Ready for link initialization..."}"
              </p>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2 opacity-40">
                  <div className="w-1.5 h-1.5 rounded-full bg-tether-teal animate-ping"></div>
                  <span className="text-[8px] font-heading font-bold text-tether-teal uppercase tracking-widest">Live Inference</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-neon-green/5 border border-neon-green/20">
                   <ShieldCheckIcon className="w-2 h-2 text-neon-green" />
                   <span className="text-[7px] font-bold text-neon-green uppercase tracking-tighter">Validated (4-Layer)</span>
                </div>
              </div>
           </div>

           <div className="mt-auto pt-4 flex items-center justify-between">
              <div className="flex gap-2">
                <Badge variant="outline" className="text-[7px] py-0 border-white/10 text-neutral-gray uppercase">Alpha Scouting</Badge>
                <Badge variant="outline" className="text-[7px] py-0 border-white/10 text-neutral-gray uppercase">Swarm Mode</Badge>
              </div>
              <div className="text-[8px] font-mono text-neutral-gray/40">v2.2.0-hackathon</div>
           </div>
        </CardContent>
      </Card>

      {/* Live Audit Log */}
      <Card className="glass shadow-2xl border-white/10 relative overflow-hidden flex flex-col">
        <CardHeader className="pb-2 border-b border-white/5">
          <CardTitle className="flex items-center gap-2 text-neutral-gray-light text-[10px] font-heading font-bold uppercase tracking-[0.2em]">
            <Activity className="w-4 h-4 text-cyber-cyan animate-pulse" />
            Live Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-y-auto max-h-[180px] custom-scrollbar">
           {stats?.recentActions?.length > 0 ? (
             <div className="divide-y divide-white/5">
               {stats.recentActions.slice(0, 5).map((action, idx) => (
                 <div key={idx} className="p-3 hover:bg-white/5 transition-colors group">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[9px] font-bold text-white uppercase tracking-wider group-hover:text-tether-teal transition-colors">{action.title}</span>
                      <span className="text-[7px] font-mono text-neutral-gray uppercase">{action.time}</span>
                    </div>
                    <p className="text-[8px] text-neutral-gray-light leading-relaxed line-clamp-1">{action.description}</p>
                 </div>
               ))}
             </div>
           ) : (
             <div className="p-8 text-center text-[9px] font-heading text-neutral-gray uppercase tracking-widest opacity-50">
               Initializing neural link...
             </div>
           )}
        </CardContent>
      </Card>
    </div>
  );
}

const ShieldCheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
);

const CheckCircleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>
);
