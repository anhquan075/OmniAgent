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
    className="p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-colors"
  >
    <span className="text-[10px] font-heading text-neutral-gray uppercase tracking-widest block mb-1">{label}</span>
    <p className={`text-base font-mono font-semibold ${color}`}>{value}</p>
  </SpotlightCard>
);

const GOVERNANCE_STEPS = [
  { num: 1, label: 'Hard Rules',               icon: Shield,    color: 'text-tether-teal',  bg: 'bg-tether-teal/20',  border: 'border-tether-teal/30' },
  { num: 2, label: 'Statistical Anomaly (Z/IQR)', icon: BarChart3, color: 'text-cyber-purple', bg: 'bg-cyber-purple/20', border: 'border-cyber-purple/30' },
  { num: 3, label: 'AI Interpretation',        icon: Brain,     color: 'text-cyber-blue',   bg: 'bg-cyber-blue/20',   border: 'border-cyber-blue/30' },
  { num: 4, label: 'Human Approval',           icon: CheckCircle2, color: 'text-xaut-gold', bg: 'bg-xaut-gold/20',   border: 'border-xaut-gold/30' },
];

export default function AgentBrain({ stats }: AgentBrainProps) {
  const anomalyStats = stats?.anomalyDetection || {};
  const governanceStats = stats?.governance || {};
  const paymentStats = stats?.payment || {};
  const adaptiveStats = stats?.adaptive || {};

  return (
    <div className="flex flex-col h-full max-h-full gap-4 overflow-y-auto pb-4">

      {/* Anomaly Detection */}
      <section className="rounded-xl bg-white/[0.03] border border-cyber-purple/20 overflow-hidden">
        <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/5 bg-cyber-purple/5">
          <BarChart3 className="w-4 h-4 text-cyber-purple" />
          <h3 className="text-[10px] font-heading font-bold uppercase tracking-[0.2em] text-white">Anomaly Detection</h3>
        </div>
        <div className="p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <StatBox label="Checked"    value={anomalyStats.totalChecked || 0} />
            <StatBox label="Anomalies"  value={anomalyStats.anomaliesDetected || 0} color="text-cyber-purple" />
            <StatBox label="Last Z-Score" value={anomalyStats.lastZScore?.toFixed(2) || '—'} />
            <StatBox label="Mode"       value={anomalyStats.coldStartMode ? 'Cold' : 'Warm'} color="text-tether-teal" />
          </div>

          {/* Z-score bar */}
          {anomalyStats.lastZScore !== undefined && (
            <div className="mt-3">
              <div className="flex justify-between text-[9px] text-neutral-gray mb-1">
                <span>Z-Score Threshold</span>
                <span className={anomalyStats.lastZScore > 2 ? 'text-red-400' : 'text-neon-green'}>
                  {anomalyStats.lastZScore > 2 ? 'ALERT' : 'NORMAL'}
                </span>
              </div>
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${anomalyStats.lastZScore > 2 ? 'bg-red-500' : 'bg-gradient-to-r from-tether-teal to-neon-green'}`}
                  style={{ width: `${Math.min((Math.abs(anomalyStats.lastZScore) / 3) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-[10px]">
            <div className={`w-1.5 h-1.5 rounded-full ${anomalyStats.coldStartMode ? 'bg-yellow-500 animate-pulse' : 'bg-neon-green animate-pulse'}`} />
            <span className="text-neutral-gray uppercase tracking-wider">
              {anomalyStats.coldStartMode ? 'Conservative thresholds (cold start)' : 'Z/IQR detection active'}
            </span>
          </div>
        </div>
      </section>

      {/* 4-Layer Governance Pipeline */}
      <section className="rounded-xl bg-white/[0.03] border border-neon-green/20 overflow-hidden">
        <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/5 bg-neon-green/5">
          <Layers className="w-4 h-4 text-neon-green" />
          <h3 className="text-[10px] font-heading font-bold uppercase tracking-[0.2em] text-white">Governance Pipeline</h3>
        </div>
        <div className="p-4">
          {/* Animated step list */}
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-[13px] top-4 bottom-4 w-px bg-gradient-to-b from-tether-teal/40 via-cyber-purple/30 to-xaut-gold/40" />

            <div className="space-y-2">
              {GOVERNANCE_STEPS.map((step, i) => {
                const Icon = step.icon;
                const isLast = i === GOVERNANCE_STEPS.length - 1;
                return (
                  <div key={step.num} className="flex items-center gap-3 relative pl-1">
                    {/* Step circle */}
                    <div className={`w-7 h-7 rounded-full ${step.bg} border ${step.border} flex items-center justify-center flex-shrink-0 z-10`}>
                      <Icon className={`w-3.5 h-3.5 ${step.color}`} />
                    </div>

                    <SpotlightCard
                      spotlightColor={`rgba(38,161,123,0.08)`}
                      className="flex-1 flex items-center justify-between px-2 sm:px-3 py-2 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-colors min-w-0"
                    >
                      <span className="text-[10px] sm:text-[11px] text-white font-medium truncate pr-2">{step.label}</span>
                      <CheckCircleIcon className="w-3.5 h-3.5 text-neon-green flex-shrink-0" />
                    </SpotlightCard>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Governance counters */}
          <div className="mt-3 sm:mt-4 grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
            <div className="p-1.5 sm:p-2 rounded bg-neon-green/10 border border-neon-green/20">
              <p className="text-[11px] sm:text-xs font-mono font-bold text-neon-green">{governanceStats.autoApproved || 0}</p>
              <span className="text-[8px] text-neutral-gray uppercase block mt-0.5 leading-tight">Auto</span>
            </div>
            <div className="p-1.5 sm:p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-[11px] sm:text-xs font-mono font-bold text-yellow-500">{governanceStats.flaggedForReview || 0}</p>
              <span className="text-[8px] text-neutral-gray uppercase block mt-0.5 leading-tight">Flagged</span>
            </div>
            <div className="p-1.5 sm:p-2 rounded bg-red-500/10 border border-red-500/20">
              <p className="text-[11px] sm:text-xs font-mono font-bold text-red-500">{governanceStats.rejected || 0}</p>
              <span className="text-[8px] text-neutral-gray uppercase block mt-0.5 leading-tight">Rejected</span>
            </div>
          </div>
        </div>
      </section>

      {/* Payment & Scheduler */}
      <section className="rounded-xl bg-white/[0.03] border border-cyber-cyan/20 overflow-hidden">
        <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/5 bg-cyber-cyan/5">
          <Coins className="w-4 h-4 text-cyber-cyan" />
          <h3 className="text-[10px] font-heading font-bold uppercase tracking-[0.2em] text-white">Payment & Scheduler</h3>
        </div>
        <div className="p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <StatBox label="Access Tier"  value={<span className="capitalize">{paymentStats.tier || 'anonymous'}</span>} color="text-cyber-cyan" />
            <StatBox label="x402 Revenue" value={stats?.x402Revenue || '0.00'} />
            <SpotlightCard
              spotlightColor="rgba(38,161,123,0.1)"
              className="col-span-2 p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-colors"
            >
              <span className="text-[10px] font-heading text-neutral-gray uppercase tracking-widest block mb-2">Adaptive Polling</span>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-tether-teal" />
                  <span className="text-sm font-mono text-white">
                    {adaptiveStats.stateSummary?.isHealthy ? 'Active' : 'Paused'}
                  </span>
                </div>
                <Badge variant="outline" className={`text-[10px] h-5 px-2 ${adaptiveStats.stateSummary?.isHealthy ? 'border-neon-green/30 text-neon-green' : 'border-red-500/30 text-red-500'}`}>
                  {adaptiveStats.stateSummary?.isHealthy ? 'Healthy' : 'Unhealthy'}
                </Badge>
              </div>
            </SpotlightCard>
          </div>
        </div>
      </section>

      {/* Agent Reasoning */}
      <section className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
        <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/5">
          <BrainCircuit className="w-4 h-4 text-tether-teal animate-pulse" />
          <h3 className="text-[10px] font-heading font-bold uppercase tracking-[0.2em] text-neutral-gray-light">Agent Reasoning</h3>
        </div>
        <div className="p-4">
          <div className="relative p-3 sm:p-4 rounded-xl bg-white/5 border border-white/5 overflow-hidden group">
            {/* Left accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-tether-teal via-cyan-400 to-transparent rounded-full" />
            {/* Subtle scan line */}
            <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700"
              style={{
                background: 'linear-gradient(180deg, transparent 0%, rgba(38,161,123,0.03) 50%, transparent 100%)',
                animation: 'scan-line 3s linear infinite',
              }}
            />
            <p className="text-xs text-white leading-relaxed font-mono italic opacity-90 pl-2">
              "{stats?.lastReasoning || "Strategist is idling. Ready for link initialization..."}"
              <span className="inline-block w-0.5 h-3.5 bg-tether-teal ml-0.5 align-middle" style={{ animation: 'cursor-blink 1s step-end infinite' }} />
            </p>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-tether-teal animate-ping" />
                <span className="text-[10px] font-heading font-bold text-tether-teal uppercase tracking-widest">Live Inference</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neon-green/5 border border-neon-green/20">
                <ShieldCheckIcon className="w-3 h-3 text-neon-green" />
                <span className="text-[8px] font-bold text-neon-green uppercase tracking-tighter">Validated</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-2">
              <Badge variant="outline" className="text-[8px] h-5 px-2 border-white/10 text-neutral-gray uppercase">Alpha Scouting</Badge>
              <Badge variant="outline" className="text-[8px] h-5 px-2 border-white/10 text-neutral-gray uppercase">Swarm Mode</Badge>
            </div>
            <div className="text-[9px] font-mono text-neutral-gray/50">v2.2.0</div>
          </div>
        </div>
      </section>

      {/* Live Audit Trail */}
      <section className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
        <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/5">
          <Activity className="w-4 h-4 text-cyber-cyan animate-pulse" />
          <h3 className="text-[10px] font-heading font-bold uppercase tracking-[0.2em] text-neutral-gray-light">Live Audit Trail</h3>
        </div>
        <div className="overflow-y-auto max-h-[180px] custom-scrollbar">
          {stats?.recentActions?.length > 0 ? (
            <div className="divide-y divide-white/5">
              {stats.recentActions.slice(0, 5).map((action: any, idx: number) => (
                <div key={idx} className="px-4 py-3 hover:bg-white/5 transition-colors group flex gap-3 items-start">
                  <div className="w-1 h-full min-h-[24px] rounded-full bg-tether-teal/30 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <span className="text-[10px] font-bold text-white uppercase tracking-wider group-hover:text-tether-teal transition-colors truncate">{action.title}</span>
                      <span className="text-[9px] font-mono text-neutral-gray/60 whitespace-nowrap flex-shrink-0">{action.time}</span>
                    </div>
                    <p className="text-[10px] text-neutral-gray-light leading-relaxed line-clamp-2">{action.description}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-[10px] font-heading text-neutral-gray uppercase tracking-widest opacity-50">
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
