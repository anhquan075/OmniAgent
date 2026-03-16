import { useCallback, useState } from "react";
import { circuitBreakerAbi } from "@/lib/abi";
import { ZERO_ADDRESS as ZERO_ADDR } from "@/lib/constants";

export function useCircuitBreakerState() {
  const [paused, setPaused] = useState(false);
  const [signalA, setSignalA] = useState(false);
  const [signalB, setSignalB] = useState(false);
  const [signalC, setSignalC] = useState(false);
  const [lastTripTimestamp, setLastTripTimestamp] = useState(0n);
  const [recoveryTimestamp, setRecoveryTimestamp] = useState(0n);

  const refresh = useCallback(async ({ provider, circuitBreakerAddress }) => {
    if (
      !provider ||
      !circuitBreakerAddress ||
      circuitBreakerAddress === ZERO_ADDR
    )
      return;
    const ethersLib = await import("ethers");
    const cb = new ethersLib.Contract(
      circuitBreakerAddress,
      circuitBreakerAbi,
      provider
    );

    const status = await cb.previewBreaker();
    setPaused(status.paused);
    setSignalA(status.signalA);
    setSignalB(status.signalB);
    setSignalC(status.signalC);
    setLastTripTimestamp(status.lastTripTimestamp);
    setRecoveryTimestamp(status.recoveryTimestamp);
  }, []);

  return {
    paused,
    signalA,
    signalB,
    signalC,
    lastTripTimestamp,
    recoveryTimestamp,
    refresh,
  };
}
