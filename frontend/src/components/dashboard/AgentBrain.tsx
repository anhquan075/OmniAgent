import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Shield, Activity, Zap, Calculator, TrendingUp, Cpu, Lock, CheckCircle2, ExternalLink, BrainCircuit, ShieldAlert, Coins } from 'lucide-react';
import { useAccount } from 'wagmi';
import { BLOCK_EXPLORERS } from '@/lib/networkConfig';

export default function AgentBrain() {
  const { isConnected } = useAccount();
  const [stats, setStats] = useState(null);
  const [simAmount, setSimAmount] = useState(1000);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        setStats(data);
      } catch (e) {
        console.error("Stats fetch failed", e);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const getRiskColor = (drawdown) => {
    if (drawdown >= 2000) return 'text-red-500 bg-red-500/10 border-red-500/20';
    if (drawdown >= 1000) return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
    return 'text-tether-teal bg-tether-teal/10 border-tether-teal/20';
  };

  const currentRisk = stats?.risk?.drawdownBps >= 1000 ? 'HIGH' : 'LOW';

  return (
    <div className="flex flex-col gap-4">
      {/* ZK-Risk Engine */}
      <Card className="glass shadow-2xl border-tether-teal/20 overflow-hidden group relative">
        <div className="absolute top-0 right-0 p-3 flex gap-2">
           <Badge className="bg-tether-teal/20 text-tether-teal border-tether-teal/40 text-[7px] uppercase font-mono animate-pulse">
             <Lock className="w-2 h-2 mr-1" /> ZK-PROVEN
           </Badge>
        </div>
        <CardHeader className="pb-2 border-b border-white/5 bg-tether-teal/5">
          <CardTitle className="flex items-center gap-2 text-white text-[10px] font-heading font-bold uppercase tracking-[0.2em]">
            <Shield className="w-4 h-4 text-tether-teal shadow-glow-sm" />
            Trustless Risk Guard
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className={`px-8 py-4 rounded-2xl border ${getRiskColor(stats?.risk?.drawdownBps || 0)} flex flex-col items-center transition-all duration-500 shadow-glow-lg bg-black/40`}>
              <span className="text-[9px] font-bold uppercase tracking-[0.3em] opacity-60 mb-1">Risk Regime</span>
              <span className="text-4xl font-heading font-black tracking-tighter">{currentRisk}</span>
            </div>
            <div className="w-full space-y-3">
              <div className="flex justify-between items-end">
                <div className="flex flex-col">
                  <span className="text-[8px] font-heading text-neutral-gray uppercase tracking-widest">Monte Carlo Drawdown</span>
                  <span className="text-xs font-mono text-tether-teal">{stats?.risk?.drawdownBps || '0'} BPS</span>
                </div>
                <div className="flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse"></div>
                   <span className="text-[7px] font-bold text-neon-green uppercase tracking-tighter">Verified</span>
                </div>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="h-full bg-gradient-to-r from-tether-teal to-cyber-cyan transition-all duration-1000 shadow-glow-sm" 
                  style={{ width: `${Math.min((stats?.risk?.drawdownBps || 0) / 30, 100)}%` }}
                />
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
                   <span className="text-[7px] font-bold text-neon-green uppercase tracking-tighter">Validated (3-Layer)</span>
                </div>
              </div>
           </div>
           
           {/* x402 Revenue Section */}
           <div className="mt-4 p-3 rounded-lg bg-cyber-blue/5 border border-cyber-blue/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <Coins className="w-3 h-3 text-cyber-cyan" />
                 <span className="text-[9px] font-heading font-bold text-neutral-gray uppercase tracking-widest">x402 Revenue</span>
              </div>
              <div className="flex flex-col items-end">
                 <span className="text-xs font-mono text-white font-bold">{stats?.x402Revenue || "0.00"} USDT</span>
                 <span className="text-[7px] text-cyber-cyan/60 uppercase tracking-tighter">Fee Collection Active</span>
              </div>
           </div>

           <div className="mt-auto pt-4 flex items-center justify-between">
              <div className="flex gap-2">
                <Badge variant="outline" className="text-[7px] py-0 border-white/10 text-neutral-gray uppercase">Alpha Scouting</Badge>
                <Badge variant="outline" className="text-[7px] py-0 border-white/10 text-neutral-gray uppercase">Swarm Mode</Badge>
              </div>
              <div className="text-[8px] font-mono text-neutral-gray/40">v2.1.4-swarm</div>
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
        <CardContent className="flex-1 p-0 overflow-y-auto max-h-[220px] custom-scrollbar">
           {stats?.recentActions?.length > 0 ? (
             <div className="divide-y divide-white/5">
               {stats.recentActions.map((action, idx) => (
                 <div key={idx} className="p-3 hover:bg-white/5 transition-colors group">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[9px] font-bold text-white uppercase tracking-wider group-hover:text-tether-teal transition-colors">{action.title}</span>
                      <span className="text-[7px] font-mono text-neutral-gray uppercase">{action.time}</span>
                    </div>
                    <p className="text-[8px] text-neutral-gray-light leading-relaxed line-clamp-1">{action.description}</p>
                     {action.hash && (
                       <a 
                         href={`${BLOCK_EXPLORERS.TESTNET}/tx/${action.hash}`} 
                         target="_blank" 
                         rel="noreferrer"
                         className="text-[7px] font-mono text-tether-teal hover:text-cyber-cyan transition-colors flex items-center gap-1 mt-1"
                       >
                         {action.hash.substring(0, 16)}... <ExternalLink size={8} />
                       </a>
                     )}
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
