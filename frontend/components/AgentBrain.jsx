import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './shared/Card';
import { Badge } from './shared/Badge';
import { AlertCircle, CheckCircle2, Shield, Activity, TrendingUp, Zap, Clock } from 'lucide-react';

/**
 * AgentBrain Dashboard
 * Visualizes the real-time decision making process of the TetherProof WDK Agent.
 */
export function AgentBrain() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('OFFLINE');
  const [currentRisk, setCurrentRisk] = useState({ level: 'LOW', drawdown: 0 });
  const scrollRef = useRef(null);

  useEffect(() => {
    const eventSource = new EventSource('http://localhost:3001/api/agent/stream');

    eventSource.onopen = () => setStatus('ONLINE');
    eventSource.onerror = () => setStatus('OFFLINE');

    eventSource.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.type === 'history') {
        setEvents(payload.data);
        if (payload.data.length > 0) {
          const last = payload.data[payload.data.length - 1];
          setCurrentRisk({ level: last.riskLevel, drawdown: last.drawdown });
        }
      } else if (payload.type === 'event') {
        setEvents(prev => [...prev.slice(-49), payload.data]);
        setCurrentRisk({ level: payload.data.riskLevel, drawdown: payload.data.drawdown });
      }
    };

    return () => eventSource.close();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const getRiskColor = (level) => {
    switch (level) {
      case 'HIGH': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'MEDIUM': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      default: return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    }
  };

  const getNodeIcon = (node) => {
    switch (node) {
      case 'analyzeRisk': return <Shield className="w-4 h-4" />;
      case 'checkStrategy': return <Activity className="w-4 h-4" />;
      case 'executeRebalance': return <Zap className="w-4 h-4" />;
      case 'checkCrossChainYields': return <TrendingUp className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
      {/* Risk Monitor */}
      <Card className="bg-slate-900 border-slate-800 shadow-2xl">
        <CardHeader className="pb-2 border-b border-slate-800">
          <CardTitle className="flex items-center gap-2 text-slate-100 text-sm font-semibold uppercase tracking-wider">
            <Shield className="w-4 h-4 text-emerald-400" />
            Live Risk Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className={`px-6 py-3 rounded-2xl border ${getRiskColor(currentRisk.level)} flex flex-col items-center transition-all duration-500`}>
              <span className="text-xs font-bold uppercase tracking-widest opacity-70">Current Regime</span>
              <span className="text-3xl font-black">{currentRisk.level}</span>
            </div>
            <div className="w-full space-y-2">
              <div className="flex justify-between text-xs font-medium text-slate-400">
                <span>Monte Carlo Drawdown</span>
                <span className="text-slate-200">{currentRisk.drawdown} BPS</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${currentRisk.level === 'HIGH' ? 'bg-red-500' : currentRisk.level === 'MEDIUM' ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min((currentRisk.drawdown / 2000) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Autonomous Feed */}
      <Card className="md:col-span-2 bg-slate-900 border-slate-800 shadow-2xl overflow-hidden flex flex-col h-[400px]">
        <CardHeader className="pb-2 border-b border-slate-800 flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-slate-100 text-sm font-semibold uppercase tracking-wider">
            <Activity className="w-4 h-4 text-blue-400" />
            Agent Thought Process
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${status === 'ONLINE' ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-[10px] font-bold tracking-tighter text-slate-500 uppercase">{status}</span>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0 scrollbar-thin scrollbar-thumb-slate-700" ref={scrollRef}>
          <div className="divide-y divide-slate-800">
            {events.length === 0 ? (
              <div className="p-8 text-center text-slate-500 italic text-sm">
                Waiting for agent pulse...
              </div>
            ) : (
              events.map((event) => (
                <div key={event.id} className="p-4 hover:bg-slate-800/50 transition-colors group">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 p-1.5 rounded-lg bg-slate-800 text-slate-400 group-hover:text-blue-400 transition-colors">
                      {getNodeIcon(event.node)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 capitalize">{event.node.replace(/([A-Z])/g, ' $1')}</span>
                        <span className="text-[10px] font-medium text-slate-500 font-mono">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        Action: <span className="text-slate-200 font-medium">{event.action}</span>
                      </p>
                      {event.details?.aiScore && (
                        <div className="mt-2 p-2 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-500 italic leading-snug">
                          "AI Risk Score: {event.details.aiScore.score}/100 - {event.details.aiScore.explanation}"
                        </div>
                      )}
                      {event.txHash && (
                        <a 
                          href={`https://testnet.bscscan.com/tx/${event.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-[10px] text-blue-400 hover:underline font-mono"
                        >
                          {event.txHash.slice(0, 10)}...{event.txHash.slice(-8)}
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
