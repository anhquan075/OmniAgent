import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './shared/Card';
import { Badge } from './shared/Badge';
import { AlertCircle, CheckCircle2, Shield, Activity, TrendingUp, Zap, Clock, ExternalLink } from 'lucide-react';

export default function AgentBrain() {
  const [currentRisk, setCurrentRisk] = useState({ level: 'LOW', score: 0.12, status: 'Stable' });
  const [currentStrategy, setCurrentStrategy] = useState({ activeRail: 'BNB', targetYield: 0.084, confidence: 0.95 });
  const [recentActions, setRecentActions] = useState([]);

  // Mock data for initial visual
  useEffect(() => {
    setRecentActions([
      { title: 'Rebalance Executed', description: 'Optimized USDT allocation from Buffer to Venus Rail', type: 'executeRebalance', time: '2m ago', hash: '0x123...' },
      { title: 'Risk Scan Complete', description: 'ZK-Risk score verified at 0.12 (LOW)', type: 'analyzeRisk', time: '15m ago' },
      { title: 'Yield Harvested', description: 'Claimed 42.5 USD₮ in strategy rewards', type: 'checkStrategy', time: '1h ago' }
    ]);
  }, []);

  const getRiskColor = (level) => {
    switch (level) {
      case 'HIGH': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'MEDIUM': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      default: return 'text-tether-teal bg-tether-teal/10 border-tether-teal/20';
    }
  };

  const getActionIcon = (type) => {
    switch (type) {
      case 'analyzeRisk': return <Shield className="w-4 h-4" />;
      case 'checkStrategy': return <Activity className="w-4 h-4" />;
      case 'executeRebalance': return <Zap className="w-4 h-4" />;
      case 'checkCrossChainYields': return <TrendingUp className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
      <Card className="glass shadow-2xl border-white/10">
        <CardHeader className="pb-2 border-b border-white/5">
          <CardTitle className="flex items-center gap-2 text-neutral-gray-light text-[10px] font-heading font-bold uppercase tracking-[0.2em]">
            <Shield className="w-4 h-4 text-tether-teal shadow-glow-sm" />
            ZK-Risk Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className={`px-6 py-3 rounded-2xl border ${getRiskColor(currentRisk.level)} flex flex-col items-center transition-all duration-500 shadow-glow-sm`}>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Current Regime</span>
              <span className="text-3xl font-heading font-black">{currentRisk.level}</span>
            </div>
            <div className="w-full space-y-2">
              <div className="flex justify-between text-[10px] font-heading font-medium text-neutral-gray uppercase tracking-widest">
                <span>Confidence</span>
                <span className="text-tether-teal">{(currentRisk.score * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-tether-teal transition-all duration-1000 shadow-glow-sm" 
                  style={{ width: `${currentRisk.score * 100}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass shadow-2xl border-white/10">
        <CardHeader className="pb-2 border-b border-white/5">
          <CardTitle className="flex items-center gap-2 text-neutral-gray-light text-[10px] font-heading font-bold uppercase tracking-[0.2em]">
            <Activity className="w-4 h-4 text-tether-teal shadow-glow-sm" />
            Strategy Pulse
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-heading text-neutral-gray uppercase tracking-widest">Active Rail</span>
              <Badge className="bg-tether-teal/20 text-tether-teal border-tether-teal/30 font-mono text-[10px]">{currentStrategy.activeRail}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-heading text-neutral-gray uppercase tracking-widest">Target Yield</span>
              <span className="text-xl font-heading font-bold text-cyber-cyan">{(currentStrategy.targetYield * 100).toFixed(2)}%</span>
            </div>
            <div className="pt-2">
              <div className="flex justify-between text-[10px] font-heading text-neutral-gray uppercase tracking-widest mb-2">
                <span>Execution Readiness</span>
                <span className="text-tether-teal">Ready</span>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= 5 ? 'bg-tether-teal shadow-glow-sm animate-pulse' : 'bg-white/5'}`} />
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass shadow-2xl border-white/10">
        <CardHeader className="pb-2 border-b border-white/5">
          <CardTitle className="flex items-center gap-2 text-neutral-gray-light text-[10px] font-heading font-bold uppercase tracking-[0.2em]">
            <Zap className="w-4 h-4 text-tether-teal shadow-glow-sm" />
            Recent Log
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[160px] overflow-y-auto custom-scrollbar">
            {recentActions.length === 0 ? (
              <div className="p-8 text-center text-[10px] font-heading text-neutral-gray uppercase tracking-widest opacity-50">
                Awaiting agent events...
              </div>
            ) : (
              recentActions.map((action, idx) => (
                <div key={idx} className="p-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                  <div className="flex gap-3 items-start">
                    <div className="p-1.5 rounded-lg bg-white/5 text-tether-teal mt-0.5">
                      {getActionIcon(action.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-heading font-bold text-white uppercase tracking-wider truncate">{action.title}</span>
                        <span className="text-[8px] font-mono text-neutral-gray shrink-0">{action.time}</span>
                      </div>
                      <p className="text-[9px] text-neutral-gray-light leading-relaxed mb-1.5 line-clamp-2">{action.description}</p>
                      {action.hash && (
                        <a 
                          href={`https://testnet.bscscan.com/tx/${action.hash}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[8px] font-mono text-tether-teal hover:text-cyber-cyan transition-colors flex items-center gap-1 uppercase tracking-tighter"
                        >
                          View Transaction <ExternalLink className="w-2 h-2" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
