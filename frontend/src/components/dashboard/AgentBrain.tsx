import React from 'react';
import { Badge } from '../ui/Badge';
import { SpotlightCard } from '../ui/SpotlightCard';
import { BarChart3, Layers, Coins, BrainCircuit, Activity, Clock, CheckCircle2, Shield, Brain, Zap } from 'lucide-react';

interface AgentBrainProps {
  stats?: any;
}

const StatBox = ({ label, value, color = 'text-white' }: { label: string; value: React.ReactNode; color?: string }) => (
  <SpotlightCard
    spotlightColor="rgba(38,161,123,0.1)"
    className="p-2 sm:p-3 rounded-lg glass border border-white/5 hover:border-white/10 transition-colors"
  >
    <span className="text-[9px] sm:text-[10px] font-heading text-neutral-gray uppercase tracking-widest block mb-1">{label}</span>
    <p className={`text-sm sm:text-base font-heading font-semibold ${color}`}>{value}</p>
  </SpotlightCard>
);

const GOVERNANCE_STEPS = [
  { num: 1, label: 'Hard Rules',               icon: Shield,    color: 'text-tether-teal',  bg: 'bg-tether-teal/20',  border: 'border-tether-teal/30' },
  { num: 2, label: 'Statistical Anomaly (Z/IQR)', icon: BarChart3, color: 'text-cyber-cyan', bg: 'bg-cyber-cyan/20', border: 'border-cyber-cyan/30' },
  { num: 3, label: 'AI Interpretation',        icon: Brain,     color: 'text-tether-teal',   bg: 'bg-tether-teal/20',   border: 'border-tether-teal/30' },
  { num: 4, label: 'Human Approval',           icon: CheckCircle2, color: 'text-xaut-gold', bg: 'bg-xaut-gold/20',   border: 'border-xaut-gold/30' },
];

export default function AgentBrain({ stats }: AgentBrainProps) {
  const anomalyStats = stats?.anomalyDetection || {
    totalChecked: 0,
    anomaliesDetected: 0,
    lastZScore: undefined,
    coldStartMode: true
  };
  
  const governanceStats = stats?.governance || {
    autoApproved: 0,
    flaggedForReview: 0,
    rejected: 0
  };
  
  const paymentStats = stats?.payment || {
    tier: 'anonymous'
  };
  
  const adaptiveStats = stats?.adaptive || {
    stateSummary: { isHealthy: false }
  };
  
  const recentActions = stats?.recentActions || [];
  const lastReasoning = stats?.lastReasoning || "Strategist is idling. Ready for link initialization...";
  const x402Revenue = stats?.x402Revenue || '0.00';

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Anomaly Detection */}
      <section className="rounded-xl overflow-hidden bg-black/20 backdrop-blur-sm border border-tether-teal/30">
        <div className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2 sm:py-2.5 md:py-3 border-b border-white/5 bg-tether-teal/5">
          <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-tether-teal flex-shrink-0" />
          <h3 className="text-[9px] sm:text-[10px] font-heading font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-white truncate">Anomaly Detection</h3>
        </div>
        <div className="p-2.5 sm:p-3 md:p-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 md:gap-3">
            <StatBox label="Checked"    value={anomalyStats.totalChecked} />
            <StatBox label="Anomalies"  value={anomalyStats.anomaliesDetected} color="text-tether-teal" />
            <StatBox label="Last Z-Score" value={anomalyStats.lastZScore?.toFixed(2) || '—'} />
            <StatBox label="Mode"       value={anomalyStats.coldStartMode ? 'Cold' : 'Warm'} color="text-tether-teal" />
          </div>

          {anomalyStats.lastZScore !== undefined && (
            <div className="mt-2.5 sm:mt-3">
              <div className="flex justify-between text-[8px] sm:text-[9px] text-neutral-gray mb-1">
                <span>Z-Score Threshold</span>
                <span className={anomalyStats.lastZScore > 2 ? 'text-xaut-gold' : 'text-neon-green'}>
                  {anomalyStats.lastZScore > 2 ? 'ALERT' : 'NORMAL'}
                </span>
              </div>
              <div className="h-1 w-full glass rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${anomalyStats.lastZScore > 2 ? 'bg-xaut-gold' : 'bg-gradient-to-r from-tether-teal to-neon-green'}`}
                  style={{ width: `${Math.min((Math.abs(anomalyStats.lastZScore) / 3) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-2.5 sm:mt-3 flex items-center gap-2 text-[9px] sm:text-[10px]">
            <div className={`w-1.5 h-1.5 rounded-full ${anomalyStats.coldStartMode ? 'bg-xaut-gold animate-pulse' : 'bg-neon-green animate-pulse'}`} />
            <span className="text-neutral-gray uppercase tracking-wider line-clamp-1">
              {anomalyStats.coldStartMode ? 'Conservative thresholds (cold start)' : 'Z/IQR detection active'}
            </span>
          </div>
        </div>
      </section>

      {/* 4-Layer Governance Pipeline */}
      <section className="rounded-xl overflow-hidden bg-black/20 backdrop-blur-sm border border-neon-green/30">
        <div className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2 sm:py-2.5 md:py-3 border-b border-white/5 bg-neon-green/5">
          <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neon-green flex-shrink-0" />
          <h3 className="text-[9px] sm:text-[10px] font-heading font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-white truncate">Governance Pipeline</h3>
        </div>
        <div className="p-2.5 sm:p-3 md:p-4">
          <div className="relative">
            <div className="absolute left-[11px] sm:left-[13px] top-4 bottom-4 w-px bg-gradient-to-b from-tether-teal/40 via-cyber-cyan/30 to-xaut-gold/40" />

            <div className="space-y-1.5 sm:space-y-2">
              {GOVERNANCE_STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.num} className="flex items-center gap-2 sm:gap-3 relative pl-0.5 sm:pl-1">
                    <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full ${step.bg} border ${step.border} flex items-center justify-center flex-shrink-0 z-10`}>
                      <Icon className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${step.color}`} />
                    </div>

                    <SpotlightCard
                      spotlightColor={`rgba(38,161,123,0.08)`}
                      className="flex-1 flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg glass border border-white/5 hover:border-white/10 transition-colors min-w-0"
                    >
                      <span className="text-[9px] sm:text-[10px] md:text-[11px] text-white font-medium truncate pr-2">{step.label}</span>
                      <CheckCircleIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-neon-green flex-shrink-0" />
                    </SpotlightCard>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2.5 sm:mt-3 md:mt-4 grid grid-cols-3 gap-1 sm:gap-1.5 md:gap-2 text-center">
            <div className="p-1 sm:p-1.5 md:p-2 rounded bg-neon-green/10 border border-neon-green/20">
              <p className="text-[10px] sm:text-[11px] md:text-xs font-heading font-bold text-neon-green">{governanceStats.autoApproved}</p>
              <span className="text-[7px] sm:text-[8px] text-neutral-gray uppercase block mt-0.5 leading-tight">Auto</span>
            </div>
            <div className="p-1 sm:p-1.5 md:p-2 rounded bg-xaut-gold/10 border border-xaut-gold/20">
              <p className="text-[10px] sm:text-[11px] md:text-xs font-heading font-bold text-xaut-gold">{governanceStats.flaggedForReview}</p>
              <span className="text-[7px] sm:text-[8px] text-neutral-gray uppercase block mt-0.5 leading-tight">Flagged</span>
            </div>
            <div className="p-1 sm:p-1.5 md:p-2 rounded bg-xaut-gold/10 border border-xaut-gold/20">
              <p className="text-[10px] sm:text-[11px] md:text-xs font-heading font-bold text-xaut-gold">{governanceStats.rejected}</p>
              <span className="text-[7px] sm:text-[8px] text-neutral-gray uppercase block mt-0.5 leading-tight">Rejected</span>
            </div>
          </div>
        </div>
      </section>

      {/* Payment & Scheduler */}
      <section className="rounded-xl overflow-hidden bg-black/20 backdrop-blur-sm border border-cyber-cyan/30">
        <div className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2 sm:py-2.5 md:py-3 border-b border-white/5 bg-cyber-cyan/5">
          <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyber-cyan flex-shrink-0" />
          <h3 className="text-[9px] sm:text-[10px] font-heading font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-white truncate">Payment & Scheduler</h3>
        </div>
        <div className="p-2.5 sm:p-3 md:p-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 md:gap-3">
            <StatBox label="Access Tier"  value={<span className="capitalize">{paymentStats.tier}</span>} color="text-cyber-cyan" />
            <StatBox label="x402 Revenue" value={x402Revenue} />
            <SpotlightCard
              spotlightColor="rgba(38,161,123,0.1)"
              className="col-span-2 p-2 sm:p-2.5 md:p-3 rounded-lg glass border border-white/5 hover:border-white/10 transition-colors"
            >
              <span className="text-[9px] sm:text-[10px] font-heading text-neutral-gray uppercase tracking-widest block mb-1.5 sm:mb-2">Adaptive Polling</span>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-tether-teal flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-heading text-white">
                    {adaptiveStats.stateSummary?.isHealthy ? 'Active' : 'Paused'}
                  </span>
                </div>
                <Badge variant="outline" className={`text-[9px] sm:text-[10px] h-4 sm:h-5 px-1.5 sm:px-2 ${adaptiveStats.stateSummary?.isHealthy ? 'border-neon-green/30 text-neon-green' : 'border-xaut-gold/30 text-xaut-gold'}`}>
                  {adaptiveStats.stateSummary?.isHealthy ? 'Healthy' : 'Unhealthy'}
                </Badge>
              </div>
            </SpotlightCard>
          </div>
        </div>
      </section>

      {/* Agent Reasoning */}
      <section className="rounded-xl overflow-hidden bg-black/20 backdrop-blur-sm border border-tether-teal/30">
        <div className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2 sm:py-2.5 md:py-3 border-b border-white/5">
          <BrainCircuit className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-tether-teal animate-pulse flex-shrink-0" />
          <h3 className="text-[9px] sm:text-[10px] font-heading font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-neutral-gray-light truncate">Agent Reasoning</h3>
        </div>
        <div className="p-2.5 sm:p-3 md:p-4">
          <div className="relative p-2.5 sm:p-3 md:p-4 rounded-xl glass border border-white/5 overflow-hidden group">
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-tether-teal via-cyber-cyan to-transparent rounded-full" />
            <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700"
              style={{
                background: 'linear-gradient(180deg, transparent 0%, rgba(38,161,123,0.03) 50%, transparent 100%)',
                animation: 'scan-line 3s linear infinite',
              }}
            />
            <p className="text-[10px] sm:text-xs text-white leading-relaxed font-heading italic opacity-90 pl-1.5 sm:pl-2 break-words">
              "{lastReasoning}"
              <span className="inline-block w-0.5 h-3 sm:h-3.5 bg-tether-teal ml-0.5 align-middle" style={{ animation: 'cursor-blink 1s step-end infinite' }} />
            </p>
            <div className="mt-3 sm:mt-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-tether-teal animate-ping" />
                <span className="text-[9px] sm:text-[10px] font-heading font-bold text-tether-teal uppercase tracking-widest">Live Inference</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md bg-neon-green/5 border border-neon-green/20">
                <ShieldCheckIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-neon-green flex-shrink-0" />
                <span className="text-[7px] sm:text-[8px] font-bold text-neon-green uppercase tracking-tighter whitespace-nowrap">Validated</span>
              </div>
            </div>
          </div>

            <div className="mt-2.5 sm:mt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                <Badge variant="outline" className="text-[7px] sm:text-[8px] h-4 sm:h-5 px-1.5 sm:px-2 border-white/10 text-neutral-gray uppercase">Alpha Scouting</Badge>
                <Badge variant="outline" className="text-[7px] sm:text-[8px] h-4 sm:h-5 px-1.5 sm:px-2 border-white/10 text-neutral-gray uppercase">Swarm Mode</Badge>
              </div>
              <div className="text-[8px] sm:text-[9px] font-heading text-neutral-gray/50 self-end sm:self-auto">v2.2.0</div>
          </div>
        </div>
      </section>

      {/* Live Audit Trail */}
      <section className="rounded-xl overflow-hidden bg-black/20 backdrop-blur-sm border border-cyber-cyan/30">
        <div className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2 sm:py-2.5 md:py-3 border-b border-white/5">
          <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyber-cyan animate-pulse flex-shrink-0" />
          <h3 className="text-[9px] sm:text-[10px] font-heading font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-neutral-gray-light truncate">Live Audit Trail</h3>
        </div>
        <div className="overflow-y-auto max-h-[180px] sm:max-h-[200px] md:max-h-[240px] custom-scrollbar">
          {recentActions.length > 0 ? (
            <div className="divide-y divide-white/5">
              {recentActions.slice(0, 5).map((action: any, idx: number) => (
                <div key={idx} className="px-2.5 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 hover:glass transition-colors group flex gap-2 sm:gap-3 items-start">
                  <div className="w-0.5 sm:w-1 h-full min-h-[18px] sm:min-h-[24px] rounded-full bg-tether-teal/30 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                      <span className="text-[9px] sm:text-[10px] font-bold text-white uppercase tracking-wider group-hover:text-tether-teal transition-colors truncate">{action.title}</span>
                      <span className="text-[8px] sm:text-[9px] font-heading text-neutral-gray/60 whitespace-nowrap flex-shrink-0">{action.time}</span>
                    </div>
                    <p className="text-[9px] sm:text-[10px] text-neutral-gray-light leading-relaxed line-clamp-2">{action.description}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 sm:p-8 text-center text-[9px] sm:text-[10px] font-heading text-neutral-gray uppercase tracking-widest opacity-50">
              Initializing neural link...
            </div>
          )}
        </div>
      </section>

      <style>{`
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes scan-line {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
      `}</style>
    </div>
  );
}

const ShieldCheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
    <path d="m9 12 2 2 4-4"/>
  </svg>
);

const CheckCircleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <path d="M22 4 12 14.01l-3-3"/>
  </svg>
);
