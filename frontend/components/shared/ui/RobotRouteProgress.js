import { useState, useEffect } from 'react';
import { CheckCircle2, CircleDashed, Loader2, Route } from 'lucide-react';

const STEPS = [
  "Depositing USDT to Vault",
  "Engine swapping USDT → USDF via PancakeSwap",
  "Depositing USDF → AsterDEX Earn (asUSDF)",
  "Adding liquidity to USDF/USDT pool",
  "Staking LP tokens in MasterChef",
  "Auto-harvesting CAKE & redeploying yield"
];

export function RobotRouteProgress({ isExecuting, onComplete }) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (!isExecuting) {
      setActiveStep(0);
      return;
    }

    // Simulate the rapid atomic execution steps while waiting for the block to mine
    // BNB block time is ~3 seconds, so we cycle through the 6 steps very quickly
    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < STEPS.length) {
        setActiveStep(currentStep);
        currentStep++;
      } else {
        clearInterval(interval);
        if (onComplete) onComplete();
      }
    }, 500); // 500ms per step = 3 seconds total

    return () => clearInterval(interval);
  }, [isExecuting, onComplete]);

  if (!isExecuting && activeStep === 0) return null;

  return (
    <div style={{ marginTop: 16, padding: '12px', background: 'rgba(13, 11, 9, 0.6)', borderRadius: 8, border: '1px solid var(--line)' }}>
      <p style={{ margin: "0 0 12px", fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--accent)", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
        <Route size={12} />
        Live Atomic Execution Route
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {STEPS.map((step, idx) => {
          const isPast = activeStep > idx;
          const isCurrent = activeStep === idx;
          const isFuture = activeStep < idx;

          let Icon = CircleDashed;
          let color = "var(--text-muted)";
          if (isPast) {
            Icon = CheckCircle2;
            color = "var(--success)";
          } else if (isCurrent) {
            Icon = Loader2;
            color = "var(--accent)";
          }

          return (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, opacity: isFuture ? 0.4 : 1, transition: 'opacity 0.3s' }}>
              <div style={{ color }}>
                <Icon size={14} className={isCurrent ? "animate-spin" : ""} />
              </div>
              <span style={{ fontSize: 11, color: isCurrent ? "var(--text)" : "var(--text-muted)", fontWeight: isCurrent ? 600 : 400 }}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
