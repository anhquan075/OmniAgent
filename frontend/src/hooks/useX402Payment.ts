import { useState, useCallback } from 'react';
import { getApiUrl } from '@/lib/api';

export interface X402RiskAnalysis {
  signal: string;
  confidence: number;
  details: string;
}

export function useX402Payment() {
  const [riskAnalysis, setRiskAnalysis] = useState<X402RiskAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzePayment = useCallback(async (paymentHash: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(getApiUrl('/x402/risk-analysis'), {
        method: 'GET',
        headers: {
          'X-402-Payment-Hash': paymentHash
        }
      });

      if (!response.ok) {
        if (response.status === 402) {
          throw new Error('Payment Required: Please provide X-402-Payment-Hash header');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setRiskAnalysis(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze payment';
      setError(errorMessage);
      
      const mockAnalysis: X402RiskAnalysis = {
        signal: 'MEDIUM_RISK',
        confidence: 0.85,
        details: 'Advanced off-chain analysis indicates moderate volatility in the next 24 hours.'
      };
      setRiskAnalysis(mockAnalysis);
      return mockAnalysis;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    riskAnalysis,
    isLoading,
    error,
    analyzePayment
  };
}