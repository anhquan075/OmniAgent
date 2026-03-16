import { useCallback, useState } from "react";
import { engineV2Abi } from "@/lib/abi";

export function useSharpeAndAuctionState() {
  const [currentBountyBps, setCurrentBountyBps] = useState(0n);
  const [auctionElapsed, setAuctionElapsed] = useState(0n);
  const [auctionRemaining, setAuctionRemaining] = useState(0n);
  const [minBountyBps, setMinBountyBps] = useState(0n);
  const [maxBountyBps, setMaxBountyBps] = useState(0n);
  const [sharpeMean, setSharpeMean] = useState(0n);
  const [sharpeVolatility, setSharpeVolatility] = useState(0n);
  const [sharpeRatio, setSharpeRatio] = useState(0n);
  const [observationCount, setObservationCount] = useState(0n);

  const refresh = useCallback(async ({ provider, engineAddress }) => {
    if (!provider || !engineAddress) return;
    const ethersLib = await import("ethers");
    const engine = new ethersLib.Contract(engineAddress, engineV2Abi, provider);

    const [auction, sharpe] = await Promise.all([
      engine.previewAuction(),
      engine.previewSharpe(),
    ]);

    setCurrentBountyBps(auction.currentBountyBps);
    setAuctionElapsed(auction.elapsedSeconds);
    setAuctionRemaining(auction.remainingSeconds);
    setMinBountyBps(auction.minBountyBps);
    setMaxBountyBps(auction.maxBountyBps);

    setSharpeMean(sharpe.mean);
    setSharpeVolatility(sharpe.volatility);
    setSharpeRatio(sharpe.sharpe);
    setObservationCount(sharpe.observationCount);
  }, []);

  return {
    currentBountyBps,
    auctionElapsed,
    auctionRemaining,
    minBountyBps,
    maxBountyBps,
    sharpeMean,
    sharpeVolatility,
    sharpeRatio,
    observationCount,
    refresh,
  };
}
