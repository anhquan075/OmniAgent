import { useState, useEffect, useCallback } from 'react';

export interface HealthFactorAlert {
  type: 'warning' | 'critical' | 'emergency';
  healthFactor: number;
  timestamp: Date;
  message: string;
  recommendedAction: string;
}

export interface PositionData {
  supplied: bigint;
  borrowed: bigint;
  healthFactor: bigint;
  availableBorrows: bigint;
  liquidationThreshold: bigint;
}

export function useHealthMonitor(userAddress: string | null) {
  const [positionData, setPositionData] = useState<PositionData | null>(null);
  const [alert, setAlert] = useState<HealthFactorAlert | null>(null);
  const [alertHistory, setAlertHistory] = useState<HealthFactorAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealthData = useCallback(async () => {
    if (!userAddress) return;

    setIsLoading(true);
    setError(null);

    try {
      const simulatedHealthFactor = 1.3;
      
      let alertType: 'warning' | 'critical' | 'emergency' | null = null;
      let message = '';
      let recommendedAction = '';

      if (simulatedHealthFactor < 1.1) {
        alertType = 'emergency';
        message = `CRITICAL: Health factor ${simulatedHealthFactor.toFixed(3)} - Immediate liquidation risk!`;
        recommendedAction = 'Execute emergency withdraw or add collateral immediately';
      } else if (simulatedHealthFactor < 1.2) {
        alertType = 'critical';
        message = `WARNING: Health factor ${simulatedHealthFactor.toFixed(3)} - High liquidation risk`;
        recommendedAction = 'Consider partial withdraw or adding collateral';
      } else if (simulatedHealthFactor < 1.5) {
        alertType = 'warning';
        message = `NOTICE: Health factor ${simulatedHealthFactor.toFixed(3)} - Monitor closely`;
        recommendedAction = 'Review position and consider risk management';
      }

      if (alertType) {
        const newAlert: HealthFactorAlert = {
          type: alertType,
          healthFactor: simulatedHealthFactor,
          timestamp: new Date(),
          message,
          recommendedAction
        };
        
        setAlert(newAlert);
        setAlertHistory(prev => [...prev.slice(-9), newAlert]);
      } else {
        setAlert(null);
      }

      setPositionData({
        supplied: 1000000000000000000000n,
        borrowed: 650000000000000000000n,
        healthFactor: BigInt(Math.floor(simulatedHealthFactor * 1e18)),
        availableBorrows: 350000000000000000000n,
        liquidationThreshold: 800000000000000000n
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health data');
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchHealthData();
    
    const interval = setInterval(fetchHealthData, 30000);
    
    return () => clearInterval(interval);
  }, [fetchHealthData]);

  const getRecommendedAction = useCallback((): string => {
    if (!positionData) return 'Unable to determine position status';
    
    const hf = Number(positionData.healthFactor) / 1e18;
    
    if (hf < 1.2) {
      const suppliedValue = Number(positionData.supplied) / 1e18;
      
      const targetHF = 1.5;
      const withdrawRatio = 1 - (hf / targetHF);
      const withdrawAmount = suppliedValue * withdrawRatio;
      
      return `Withdraw ${withdrawAmount.toFixed(2)} USDT to reach health factor of ${targetHF}`;
    }
    
    if (hf < 1.5) {
      return 'Consider adding collateral or reducing borrowed position';
    }
    
    return 'Position is healthy';
  }, [positionData]);

  return {
    positionData,
    alert,
    alertHistory,
    isLoading,
    error,
    refresh: fetchHealthData,
    getRecommendedAction
  };
}