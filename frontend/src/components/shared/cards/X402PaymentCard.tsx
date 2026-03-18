import React, { useState } from 'react';
import { CreditCard, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { X402RiskAnalysis } from '@/hooks/useX402Payment';

interface X402PaymentCardProps {
  riskAnalysis: X402RiskAnalysis | null;
  isLoading?: boolean;
  error?: string | null;
  onAnalyze: (paymentHash: string) => void;
}

export const X402PaymentCard: React.FC<X402PaymentCardProps> = ({ 
  riskAnalysis, 
  isLoading, 
  error,
  onAnalyze 
}) => {
  const [paymentHash, setPaymentHash] = useState('');

  const getSignalColor = (signal: string | null) => {
    if (!signal) return 'text-neutral-gray';
    if (signal.includes('LOW')) return 'text-green-500';
    if (signal.includes('MEDIUM')) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getSignalIcon = (signal: string | null) => {
    if (!signal) return CreditCard;
    if (signal.includes('LOW')) return CheckCircle;
    if (signal.includes('MEDIUM')) return AlertTriangle;
    return XCircle;
  };

  const SignalIcon = getSignalIcon(riskAnalysis?.signal || null);
  const signalColorClass = getSignalColor(riskAnalysis?.signal || null);

  const handleAnalyze = () => {
    if (paymentHash.trim()) {
      onAnalyze(paymentHash.trim());
    }
  };

  return (
    <div className="card relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CreditCard size={16} className="text-cyber-cyan" />
          <span className="text-sm font-bold text-white">X402 Payment</span>
        </div>
        {riskAnalysis && (
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
            riskAnalysis.signal.includes('LOW') ? 'bg-green-500/20 text-green-400' :
            riskAnalysis.signal.includes('MEDIUM') ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {riskAnalysis.signal}
          </span>
        )}
      </div>

      <div className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={paymentHash}
            onChange={(e) => setPaymentHash(e.target.value)}
            placeholder="Enter X-402-Payment-Hash"
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-neutral-gray focus:outline-none focus:border-cyber-cyan"
          />
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={isLoading || !paymentHash.trim()}
            className="px-4 py-2 bg-cyber-cyan hover:bg-cyber-cyan/90 disabled:bg-neutral-gray disabled:cursor-not-allowed text-space-black text-sm font-bold rounded-lg transition-colors"
          >
            {isLoading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {riskAnalysis && (
        <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg">
          <SignalIcon size={20} className={`${signalColorClass} mt-0.5`} />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-white">Risk Signal</span>
              <span className={`text-sm font-bold ${signalColorClass}`}>
                {riskAnalysis.signal}
              </span>
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-neutral-gray">Confidence</span>
              <span className="text-xs text-white">
                {(riskAnalysis.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="text-xs text-neutral-gray mt-2">
              {riskAnalysis.details}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2">
            <XCircle size={14} className="text-red-400" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
        </div>
      )}

      <div className="mt-4 p-2 bg-cyber-cyan/10 border border-cyber-cyan/20 rounded-lg">
        <div className="text-xs text-cyber-cyan">
          <strong>X402 Payment Protocol:</strong> Required header X-402-Payment-Hash for paid API access.
        </div>
      </div>
    </div>
  );
};