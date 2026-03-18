import React from 'react';
import { AlertTriangle, Heart, ShieldAlert, XCircle, CheckCircle } from 'lucide-react';
import { HealthFactorAlert, PositionData } from '@/hooks/useHealthMonitor';

interface HealthMonitorCardProps {
  positionData: PositionData | null;
  alert: HealthFactorAlert | null;
  isLoading?: boolean;
}

export const HealthMonitorCard: React.FC<HealthMonitorCardProps> = ({ positionData, alert, isLoading }) => {
  const healthFactor = positionData ? Number(positionData.healthFactor) / 1e18 : null;
  
  const getHealthFactorColor = (hf: number | null) => {
    if (hf === null) return 'text-neutral-gray';
    if (hf < 1.1) return 'text-red-500';
    if (hf < 1.2) return 'text-orange-500';
    if (hf < 1.5) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getHealthFactorIcon = (hf: number | null) => {
    if (hf === null) return Heart;
    if (hf < 1.1) return XCircle;
    if (hf < 1.2) return ShieldAlert;
    if (hf < 1.5) return AlertTriangle;
    return CheckCircle;
  };

  const HealthFactorIcon = getHealthFactorIcon(healthFactor);
  const healthColorClass = getHealthFactorColor(healthFactor);

  return (
    <div className="card relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HealthFactorIcon size={16} className={healthColorClass} />
          <span className="text-sm font-bold text-white">Health Monitor</span>
        </div>
        {alert && (
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
            alert.type === 'emergency' ? 'bg-red-500/20 text-red-400' :
            alert.type === 'critical' ? 'bg-orange-500/20 text-orange-400' :
            'bg-yellow-500/20 text-yellow-400'
          }`}>
            {alert.type}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mb-4 p-3 bg-white/5 rounded-lg">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            healthFactor !== null && healthFactor < 1.2 ? 'bg-red-500/20' : 'bg-green-500/20'
          }`}>
            <Heart size={20} className={healthColorClass} />
          </div>
          <div>
            <div className="text-xs text-neutral-gray uppercase tracking-wider">Health Factor</div>
            <div className={`text-lg font-bold ${healthColorClass}`}>
              {healthFactor !== null ? healthFactor.toFixed(3) : '—'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-neutral-gray">Status</div>
          <div className={`text-sm font-bold ${
            healthFactor !== null && healthFactor < 1.2 ? 'text-red-400' :
            healthFactor !== null && healthFactor < 1.5 ? 'text-yellow-400' :
            'text-green-400'
          }`}>
            {healthFactor !== null ? (
              healthFactor < 1.1 ? 'CRITICAL' :
              healthFactor < 1.2 ? 'WARNING' :
              healthFactor < 1.5 ? 'CAUTION' :
              'HEALTHY'
            ) : '—'}
          </div>
        </div>
      </div>

      {alert && (
        <div className={`mb-4 p-3 rounded-lg ${
          alert.type === 'emergency' ? 'bg-red-500/10 border border-red-500/30' :
          alert.type === 'critical' ? 'bg-orange-500/10 border border-orange-500/30' :
          'bg-yellow-500/10 border border-yellow-500/30'
        }`}>
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className={`mt-0.5 ${
              alert.type === 'emergency' ? 'text-red-400' :
              alert.type === 'critical' ? 'text-orange-400' :
              'text-yellow-400'
            }`} />
            <div className="flex-1">
              <div className="text-sm font-medium text-white">{alert.message}</div>
              <div className="text-xs text-neutral-gray mt-1">{alert.recommendedAction}</div>
            </div>
          </div>
        </div>
      )}

      {positionData && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 bg-white/5 rounded">
            <div className="text-neutral-gray">Supplied</div>
            <div className="text-white font-medium">
              {(Number(positionData.supplied) / 1e18).toFixed(2)} USDT
            </div>
          </div>
          <div className="p-2 bg-white/5 rounded">
            <div className="text-neutral-gray">Borrowed</div>
            <div className="text-white font-medium">
              {(Number(positionData.borrowed) / 1e18).toFixed(2)} USDT
            </div>
          </div>
          <div className="p-2 bg-white/5 rounded">
            <div className="text-neutral-gray">Available to Borrow</div>
            <div className="text-white font-medium">
              {(Number(positionData.availableBorrows) / 1e18).toFixed(2)} USDT
            </div>
          </div>
          <div className="p-2 bg-white/5 rounded">
            <div className="text-neutral-gray">Liquidation Threshold</div>
            <div className="text-white font-medium">
              {(Number(positionData.liquidationThreshold) / 1e18).toFixed(2)}%
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-cyber-cyan border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};