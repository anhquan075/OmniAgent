import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, AlertCircle, RefreshCw, XCircle, Plus, Edit2, Check, Copy } from 'lucide-react';
import { callMcpTool } from '@/lib/mcp';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface SessionKeyManagerProps {
  userAddress: string;
  smartAccountAddress: string;
}

interface SessionStatus {
  isActive: boolean;
  dailyLimit: number;
  dailySpent: number;
  expiresAt: string | null;
  allowedTargets: string[];
}

export function SessionKeyManager({ userAddress, smartAccountAddress }: SessionKeyManagerProps) {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingLimit, setEditingLimit] = useState(false);
  const [newLimit, setNewLimit] = useState('');
  const [addingTarget, setAddingTarget] = useState(false);
  const [newTarget, setNewTarget] = useState('');

  useEffect(() => {
    fetchStatus();
  }, [userAddress, smartAccountAddress]);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await callMcpTool(userAddress, 'smartaccount_getSessionKeyStatus', {});
      if (response.result) {
        setStatus({
          isActive: response.result.active,
          dailyLimit: response.result.dailyLimitUSD,
          dailySpent: response.result.dailySpentUSD,
          expiresAt: response.result.expiresAt,
          allowedTargets: response.result.allowedTargets || []
        });
        setNewLimit(response.result.dailyLimitUSD?.toString() || '');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateLimit = async () => {
    try {
      await callMcpTool(userAddress, 'smartaccount_updateDailyLimit', { 
        newLimitUSD: Number(newLimit)
      });
      setEditingLimit(false);
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const addTarget = async () => {
    if (!status) return;
    try {
      await callMcpTool(userAddress, 'smartaccount_addAllowedTarget', { 
        target: newTarget
      });
      setAddingTarget(false);
      setNewTarget('');
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const removeTarget = async (targetToRemove: string) => {
    if (!status) return;
    try {
      await callMcpTool(userAddress, 'smartaccount_removeAllowedTarget', { 
        target: targetToRemove
      });
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const revokeKey = async () => {
    try {
      await callMcpTool(userAddress, 'smartaccount_revokeSessionKey', {});
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-[#0B0E14]/80 backdrop-blur-xl border border-white/10 rounded-2xl flex justify-center">
        <RefreshCw className="w-6 h-6 text-tether-teal animate-spin" />
      </div>
    );
  }

  if (!status) return null;

  const spentPercent = status.dailyLimit > 0 ? Math.min(100, (status.dailySpent / status.dailyLimit) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#0B0E14]/80 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl w-full max-w-sm"
    >
      <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-lg", status.isActive ? "bg-tether-teal/10 text-tether-teal" : "bg-red-500/10 text-red-500")}>
            <Shield className="w-4 h-4" />
          </div>
          <h3 className="font-heading text-xs font-bold text-white uppercase tracking-wider">
            Session Key
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn("w-1.5 h-1.5 rounded-full", status.isActive ? "bg-tether-teal" : "bg-red-500 animate-pulse")} />
          <span className="text-[9px] font-mono text-neutral-gray uppercase">
            {status.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-6">
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <span className="text-[10px] text-neutral-gray font-bold uppercase tracking-wider">Daily Limit</span>
            <div className="flex items-center gap-2">
              {editingLimit ? (
                <div className="flex items-center gap-1">
                  <Input 
                    type="text"
                    value={newLimit}
                    onChange={(e) => setNewLimit(e.target.value)}
                    className="h-6 w-20 text-xs bg-black/40 border-white/10"
                    autoFocus
                  />
                  <button onClick={updateLimit} className="p-1 hover:text-tether-teal text-white/50 transition-colors">
                    <Check className="w-3 h-3" />
                  </button>
                  <button onClick={() => setEditingLimit(false)} className="p-1 hover:text-red-400 text-white/50 transition-colors">
                    <XCircle className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <span className="text-sm font-mono font-bold text-white">${status.dailyLimit}</span>
                  <button onClick={() => setEditingLimit(true)} className="opacity-0 group-hover:opacity-100 transition-opacity text-white/30 hover:text-white">
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="space-y-1.5">
            <div className="flex justify-between text-[9px] text-gray-400 font-mono">
              <span>Spent: ${status.dailySpent}</span>
              <span>{Math.round(spentPercent)}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${spentPercent}%` }}
                className={cn("h-full rounded-full", spentPercent > 80 ? "bg-red-500" : "bg-tether-teal")}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-neutral-gray font-bold uppercase tracking-wider">Allowed Targets</span>
            <button 
              onClick={() => setAddingTarget(true)}
              className="text-[9px] text-tether-teal hover:text-tether-teal/80 flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          
          <div className="space-y-2">
            {status.allowedTargets.map((target, i) => (
              <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                  <span className="text-[10px] font-mono text-gray-300 truncate w-32">{target}</span>
                </div>
                <button 
                  onClick={() => removeTarget(target)}
                  className="text-white/20 hover:text-red-400 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {status.allowedTargets.length === 0 && (
              <div className="text-[10px] text-white/20 font-mono italic text-center py-2">
                No targets allowed
              </div>
            )}
          </div>
          
          {addingTarget && (
             <div className="flex items-center gap-2 mt-2 animate-in fade-in slide-in-from-top-1">
               <Input 
                  type="text"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="0x..."
                  className="h-7 text-xs bg-black/40 border-white/10"
                  autoFocus
                />
               <Button onClick={addTarget} size="sm" className="h-7 px-2 bg-tether-teal/10 hover:bg-tether-teal/20 text-tether-teal border border-tether-teal/20">
                 <Check className="w-3 h-3" />
               </Button>
               <Button onClick={() => setAddingTarget(false)} size="sm" className="h-7 px-2 bg-white/5 hover:bg-white/10 border border-white/10">
                 <XCircle className="w-3 h-3" />
               </Button>
             </div>
          )}
        </div>

        <div className="pt-4 border-t border-white/5">
          <Button 
            onClick={revokeKey}
            variant="ghost" 
            className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs font-mono uppercase tracking-wider h-8"
          >
            <AlertCircle className="w-3.5 h-3.5 mr-2" />
            Revoke Session Key
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
