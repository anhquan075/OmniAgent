import {
  engineV2Abi,
  erc20Abi,
  farmAdapterAbi,
  managedAdapterAbi,
  oracleAbi,
  pegArbAbi,
  policyV2Abi,
  vaultV2Abi,
} from "@/lib/abi";
import { useCallback, useState } from "react";
import { useNetworkMode } from "./useNetworkMode.js";
import { NETWORK_CONFIGS } from "../lib/networkConfig.js";

function toSafeNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stateLabel(value) {
  if (value === 0n) return "Normal";
  if (value === 1n) return "Guarded";
  return "Drawdown";
}

function decodeReason(ethersLib, bytes32Reason) {
  try {
    return ethersLib.decodeBytes32String(bytes32Reason);
  } catch {
    return bytes32Reason;
  }
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
function isZeroAddr(addr) {
  return !addr || addr.toLowerCase() === ZERO_ADDR;
}

/// V2 unified read state hook - combines vault, engine, circuit breaker, and sharpe tracker
export function useVaultV2ReadState() {
  const { networkMode } = useNetworkMode();
  const networkConfig = NETWORK_CONFIGS[networkMode];
  const [assets, setAssets] = useState("-");
  const [riskState, setRiskState] = useState("-");
  const [shares, setShares] = useState("-");
  const [lastExec, setLastExec] = useState("-");
  const [canExecute, setCanExecute] = useState(null);
  const [canExecuteReason, setCanExecuteReason] = useState("-");
  const [riskScoreVal, setRiskScoreVal] = useState(null);
  const [timeUntilNext, setTimeUntilNext] = useState(null);
  const [cycleCountVal, setCycleCountVal] = useState(null);
  const [configLocked, setConfigLocked] = useState(null);
  const [totalAssetsRaw, setTotalAssetsRaw] = useState(null);
  const [userTokenBalance, setUserTokenBalance] = useState(null);
  const [asterManagedAssets, setAsterManagedAssets] = useState(null);
  const [secondaryManagedAssets, setSecondaryManagedAssets] = useState(null);
  const [lpManagedAssets, setLpManagedAssets] = useState(null);
  const [lpAdapterAddress, setLpAdapterAddress] = useState(null);
  const [lpStakingInfo, setLpStakingInfo] = useState({
    staked: 0n,
    unstaked: 0n,
    pending: 0n,
  });

  // V2-specific: gas-gated harvest metrics
  const [harvestGasEstimate, setHarvestGasEstimate] = useState(null);
  const [harvestGasMultiplier, setHarvestGasMultiplier] = useState(null);

  // V2-specific: buffer status
  const [bufferStatus, setBufferStatus] = useState(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(null);
  const [idleBufferBps, setIdleBufferBps] = useState(null);

  // V2-specific: circuit breaker
  const [breakerStatus, setBreakerStatus] = useState({
    paused: false,
    signalA: false,
    signalB: false,
    signalC: false,
    lastTripTimestamp: 0n,
    recoveryTimestamp: 0n,
  });

  // V2-specific: sharpe metrics
  const [sharpeMetrics, setSharpeMetrics] = useState({
    meanYieldBps: 0n,
    volatility: 0n,
    sharpe: 0n,
    observationCount: 0n,
    observations: [],
  });

  // V2-specific: auction metrics
  const [auctionMetrics, setAuctionMetrics] = useState({
    currentBountyBps: 0n,
    auctionElapsed: 0n,
    auctionRemaining: 0n,
    minBountyBps: 0n,
    maxBountyBps: 0n,
  });

  // V2-specific: peg arb preview
  const [arbPreview, setArbPreview] = useState(null);

  // V2-specific: composite vault health score (0-100 + human-readable label)
  const [vaultHealthScore, setVaultHealthScore] = useState(null);
  const [vaultHealthLabel, setVaultHealthLabel] = useState(null);

  // V2-specific: extended preview decision
  const [previewDecision, setPreviewDecision] = useState(null);

  const [algoMetrics, setAlgoMetrics] = useState({
    currentPrice: null,
    previousPrice: null,
    volatilityBps: null,
    guardedVolatilityBps: null,
    drawdownVolatilityBps: null,
    depegPrice: null,
    targetAsterBps: null,
    previewState: "-",
    previewReason: "-",
    normalAsterBps: null,
    guardedAsterBps: null,
    drawdownAsterBps: null,
  });

  const refresh = useCallback(
    async ({
      signer,
      provider,
      vaultAddress,
      engineAddress,
      tokenAddress,
      circuitBreakerAddress,
      sharpeTrackerAddress,
      pegArbExecutorAddress,
      decimals,
      shareDecimals,
      setDecimals,
      setShareDecimals,
      setBusyAction,
      setStatus,
      setNetworkChainId,
      setShowNetworkModal,
      silent = false,
    }) => {
      if (!silent) setBusyAction("refresh");
      try {
        const ethersLib = await import("ethers");
        const runner = signer ?? provider;
        if (!runner) throw new Error("No provider available");

        const vault = new ethersLib.Contract(
          ethersLib.getAddress(vaultAddress.trim()),
          vaultV2Abi,
          runner
        );
        const engine = new ethersLib.Contract(
          ethersLib.getAddress(engineAddress.trim()),
          engineV2Abi,
          runner
        );

        const vaultAssetAddress = await vault.asset().catch(() => tokenAddress);
        const token = new ethersLib.Contract(
          ethersLib.getAddress(vaultAssetAddress.trim()),
          erc20Abi,
          runner
        );

        let tokenDec = decimals;
        if (tokenDec === null) {
          try {
            tokenDec = await token.decimals();
          } catch {
            tokenDec = 18n;
          }
          setDecimals(tokenDec);
        }
        let shareDec = shareDecimals;
        if (shareDec === null) {
          try {
            shareDec = await vault.decimals();
          } catch {
            shareDec = 18n;
          }
          setShareDecimals(shareDec);
        }

        const user = signer ? await signer.getAddress() : null;
        const [
          totalAssets,
          currentState,
          userShares,
          lastExecution,
          canExec,
          previousPrice,
          policyAddress,
          oracleAddress,
          rawRiskScore,
          rawTimeUntilNext,
          rawCycleCount,
          isLocked,
          asterAdapterAddress,
          secondaryAdapterAddress,
          rawLpAdapterAddress,
          userTokenBal,
          rawIdleBufferBps,
          rawBufferStatus,
          rawPendingWithdrawals,
        ] = await Promise.all([
          vault.totalAssets().catch(() => null),
          engine.currentState().catch(() => null),
          user ? vault.balanceOf(user).catch(() => 0n) : Promise.resolve(0n),
          engine.lastExecution().catch(() => null),
          engine.canExecute().catch(() => [false, "0x"]),
          engine.lastPrice().catch(() => 0n),
          engine.policy().catch(() => null),
          engine.priceOracle().catch(() => null),
          engine.riskScore().catch(() => null),
          engine.timeUntilNextCycle().catch(() => null),
          engine.cycleCount().catch(() => null),
          vault.configurationLocked().catch(() => null),
          vault.asterAdapter().catch(() => null),
          vault.secondaryAdapter().catch(() => null),
          vault.lpAdapter().catch(() => null),
          user ? token.balanceOf(user).catch(() => 0n) : Promise.resolve(0n),
          vault.idleBufferBps().catch(() => null),
          vault.bufferStatus().catch(() => null),
          vault.pendingAsterWithdrawals().catch(() => null),
        ]);

        // V2 extended preview decision (contract function is previewDecision, not previewDecisionV2)
        const rawPreviewV2 = await engine.previewDecision().catch(() => null);
        if (rawPreviewV2) {
          const pd = rawPreviewV2.preview ?? rawPreviewV2;
          setPreviewDecision({
            executable: pd.executable,
            nextState: Number(pd.nextState),
            price: pd.price,
            previousPrice: pd.previousPrice,
            volatilityBps: pd.volatilityBps,
            targetAsterBps: pd.targetAsterBps,
            targetLpBps: pd.targetLpBps,
            bountyBps: pd.bountyBps,
            breakerPaused: pd.breakerPaused,
            meanYieldBps: pd.meanYieldBps,
            yieldVolatilityBps: pd.yieldVolatilityBps,
            sharpeRatio: pd.sharpeRatio,
            auctionElapsedSeconds: pd.auctionElapsedSeconds,
            bufferUtilizationBps: pd.bufferUtilizationBps,
          });
        }

        // Circuit breaker status
        if (!isZeroAddr(circuitBreakerAddress)) {
          const breakerPreview = await engine
            .previewBreaker()
            .catch(() => null);
          if (breakerPreview) {
            setBreakerStatus({
              paused:
                breakerPreview.status?.paused ?? breakerPreview.paused ?? false,
              signalA:
                breakerPreview.status?.signalA ??
                breakerPreview.signalA ??
                false,
              signalB:
                breakerPreview.status?.signalB ??
                breakerPreview.signalB ??
                false,
              signalC:
                breakerPreview.status?.signalC ??
                breakerPreview.signalC ??
                false,
              lastTripTimestamp:
                breakerPreview.status?.lastTripTimestamp ??
                breakerPreview.lastTripTimestamp ??
                0n,
              recoveryTimestamp:
                breakerPreview.status?.recoveryTimestamp ??
                breakerPreview.recoveryTimestamp ??
                0n,
            });
          }
        }

        // Sharpe tracker metrics
        if (!isZeroAddr(sharpeTrackerAddress)) {
          const sharpeTracker = new ethersLib.Contract(
            ethersLib.getAddress(sharpeTrackerAddress.trim()),
            [
              "function computeSharpe() view returns (int256,uint256,int256)",
              "function getObservations() view returns (int128[])",
              "function count() view returns (uint256)",
              "function windowSize() view returns (uint256)",
            ],
            runner
          );

          try {
            // computeSharpe returns (mean, vol, sharpe) if enough obs exist, otherwise reverts
            let meanYieldBps = 0n,
              volatility = 0n,
              sharpeRatio = 0n;
            let obsCount = 0n;
            let obs = [];

            try {
              obsCount = await sharpeTracker.count();
            } catch {}

            if (obsCount > 1n) {
              try {
                const sharpeResult = await sharpeTracker.computeSharpe();
                meanYieldBps = sharpeResult[0] ?? 0n;
                volatility = sharpeResult[1] ?? 0n;
                sharpeRatio = sharpeResult[2] ?? 0n;
              } catch {}
            }

            try {
              obs = await sharpeTracker.getObservations();
            } catch {}

            setSharpeMetrics({
              meanYieldBps,
              volatility,
              sharpe: sharpeRatio,
              observationCount: obsCount,
              observations: obs,
            });
          } catch (e) {
            // ignore tracking error
          }
        }

        // Auction metrics
        const auctionPreview = await engine.previewAuction().catch(() => null);
        if (auctionPreview) {
          setAuctionMetrics({
            currentBountyBps: auctionPreview.currentBountyBps ?? 0n,
            auctionElapsed: auctionPreview.elapsedSeconds ?? 0n,
            auctionRemaining: auctionPreview.remainingSeconds ?? 0n,
            minBountyBps: auctionPreview.minBountyBps ?? 0n,
            maxBountyBps: auctionPreview.maxBountyBps ?? 0n,
          });
        }

        // Composite vault health score
        const healthScoreResult = await engine
          .vaultHealthScore()
          .catch(() => null);
        if (healthScoreResult) {
          const rawScore = healthScoreResult.score ?? healthScoreResult[0];
          const rawLabel = healthScoreResult.label ?? healthScoreResult[1];
          setVaultHealthScore(toSafeNumber(rawScore));
          try {
            setVaultHealthLabel(ethersLib.decodeBytes32String(rawLabel));
          } catch {
            setVaultHealthLabel(null);
          }
        }

        // Peg arbitrage preview
        if (!isZeroAddr(pegArbExecutorAddress)) {
          const pegArbContract = new ethersLib.Contract(
            ethersLib.getAddress(pegArbExecutorAddress.trim()),
            pegArbAbi,
            runner
          );
          const arbPreviewData = await pegArbContract
            .previewArb()
            .catch(() => null);
          if (arbPreviewData) {
            const preview = arbPreviewData.preview || arbPreviewData;
            setArbPreview({
              direction: preview.direction ?? 0n,
              estimatedProfitBps: preview.estimatedProfitBps ?? 0n,
              tradeSize: preview.tradeSize ?? 0n,
              poolPrice: preview.poolPrice ?? 0n,
            });
          }
        }

        let currentPrice = null,
          guardedVolatilityBps = null,
          drawdownVolatilityBps = null;
        let depegPrice = null,
          normalAsterBps = null,
          guardedAsterBps = null,
          drawdownAsterBps = null;
        let rawAsterManaged = null,
          rawSecondaryManaged = null,
          rawLpManaged = null;

        if (policyAddress && oracleAddress) {
          const policy = new ethersLib.Contract(
            policyAddress,
            policyV2Abi,
            runner
          );
          const oracle = new ethersLib.Contract(
            oracleAddress,
            oracleAbi,
            runner
          );
          [
            currentPrice,
            guardedVolatilityBps,
            drawdownVolatilityBps,
            depegPrice,
            normalAsterBps,
            guardedAsterBps,
            drawdownAsterBps,
          ] = await Promise.all([
            oracle.getPrice().catch(() => null),
            policy.guardedVolatilityBps().catch(() => null),
            policy.drawdownVolatilityBps().catch(() => null),
            policy.depegPrice().catch(() => null),
            policy.normalAsterBps().catch(() => null),
            policy.guardedAsterBps().catch(() => null),
            policy.drawdownAsterBps().catch(() => null),
          ]);
        }

        if (!isZeroAddr(asterAdapterAddress)) {
          const asterAdapterContract = new ethersLib.Contract(
            asterAdapterAddress,
            managedAdapterAbi,
            runner
          );
          rawAsterManaged = await asterAdapterContract
            .managedAssets()
            .catch(() => null);
        }
        if (!isZeroAddr(secondaryAdapterAddress)) {
          const secondaryAdapterContract = new ethersLib.Contract(
            secondaryAdapterAddress,
            managedAdapterAbi,
            runner
          );
          rawSecondaryManaged = await secondaryAdapterContract
            .managedAssets()
            .catch(() => null);
        }
        if (rawLpAdapterAddress) {
          const lpAdapterContract = new ethersLib.Contract(
            rawLpAdapterAddress,
            managedAdapterAbi,
            runner
          );
          rawLpManaged = await lpAdapterContract
            .managedAssets()
            .catch(() => null);
          setLpAdapterAddress(rawLpAdapterAddress);

          // Query LP staking info + gas harvest params if farm adapter exists
          const lpAdapterWithFarm = new ethersLib.Contract(
            rawLpAdapterAddress,
            farmAdapterAbi,
            runner
          );
          const [
            stakingResult,
            rawHarvestGasEstimate,
            rawHarvestGasMultiplier,
          ] = await Promise.all([
            lpAdapterWithFarm
              .stakingInfo()
              .catch(() => ({ staked: 0n, unstaked: 0n, pending: 0n })),
            lpAdapterWithFarm.harvestGasEstimate().catch(() => null),
            lpAdapterWithFarm.harvestGasMultiplier().catch(() => null),
          ]);
          setHarvestGasEstimate(
            rawHarvestGasEstimate != null
              ? toSafeNumber(rawHarvestGasEstimate)
              : null
          );
          setHarvestGasMultiplier(
            rawHarvestGasMultiplier != null
              ? toSafeNumber(rawHarvestGasMultiplier)
              : null
          );
          if (stakingResult && Array.isArray(stakingResult)) {
            setLpStakingInfo({
              staked: stakingResult[0] ?? 0n,
              unstaked: stakingResult[1] ?? 0n,
              pending: stakingResult[2] ?? 0n,
            });
          } else if (stakingResult && typeof stakingResult === "object") {
            setLpStakingInfo({
              staked: stakingResult.staked ?? 0n,
              unstaked: stakingResult.unstaked ?? 0n,
              pending: stakingResult.pending ?? 0n,
            });
          }
        }

        const prevP = previousPrice ?? 0n;
        const curP = currentPrice ?? 0n;
        const priceDiff = curP >= prevP ? curP - prevP : prevP - curP;
        const volatilityBps = prevP > 0n ? (priceDiff * 10_000n) / prevP : null;

        let previewState = "Normal";
        let previewReason = "Volatility below guarded threshold";
        let targetAsterBps = normalAsterBps;

        if (
          currentPrice != null &&
          depegPrice != null &&
          drawdownVolatilityBps != null &&
          volatilityBps != null
        ) {
          if (
            currentPrice < depegPrice ||
            volatilityBps >= drawdownVolatilityBps
          ) {
            previewState = "Drawdown";
            targetAsterBps = drawdownAsterBps;
            previewReason =
              currentPrice < depegPrice
                ? "Price below depeg threshold"
                : "Volatility reached drawdown threshold";
          } else if (
            guardedVolatilityBps != null &&
            volatilityBps >= guardedVolatilityBps
          ) {
            previewState = "Guarded";
            targetAsterBps = guardedAsterBps;
            previewReason = "Volatility reached guarded threshold";
          }
        }

        setAlgoMetrics({
          currentPrice,
          previousPrice: prevP,
          volatilityBps,
          guardedVolatilityBps,
          drawdownVolatilityBps,
          depegPrice,
          targetAsterBps,
          previewState,
          previewReason,
          normalAsterBps,
          guardedAsterBps,
          drawdownAsterBps,
        });
        setAsterManagedAssets(rawAsterManaged);
        setSecondaryManagedAssets(rawSecondaryManaged);
        setLpManagedAssets(rawLpManaged);
        setTotalAssetsRaw(totalAssets);
        setAssets(
          totalAssets != null
            ? ethersLib.formatUnits(totalAssets, tokenDec)
            : "-"
        );
        setRiskState(currentState != null ? stateLabel(currentState) : "-");
        setShares(ethersLib.formatUnits(userShares ?? 0n, shareDec));
        setUserTokenBalance(userTokenBal);
        setLastExec(
          lastExecution == null
            ? "-"
            : lastExecution === 0n
            ? "never"
            : new Date(Number(lastExecution) * 1000).toISOString()
        );
        setConfigLocked(isLocked);
        setIdleBufferBps(rawIdleBufferBps);

        // V2 buffer status
        if (rawBufferStatus) {
          const target = rawBufferStatus.target ?? rawBufferStatus[0] ?? 0n;
          const current = rawBufferStatus.current ?? rawBufferStatus[1] ?? 0n;
          const utilizationBps =
            rawBufferStatus.utilizationBps ?? rawBufferStatus[2] ?? 0n;
          setBufferStatus({
            target,
            current,
            utilizationBps,
          });
        }

        // V2 pending withdrawals
        if (rawPendingWithdrawals) {
          setPendingWithdrawals({
            count: rawPendingWithdrawals.count ?? 0n,
            totalAmount: rawPendingWithdrawals.totalAmount ?? 0n,
          });
        }

        const [isExecutable, reason] = canExec ?? [false, "0x"];
        setCanExecute(isExecutable);
        setCanExecuteReason(decodeReason(ethersLib, reason));
        setRiskScoreVal(toSafeNumber(rawRiskScore));
        setTimeUntilNext(toSafeNumber(rawTimeUntilNext));
        setCycleCountVal(toSafeNumber(rawCycleCount));
        if (!silent) {
          setStatus(
            `State refreshed | canExecute=${isExecutable} (${decodeReason(
              ethersLib,
              reason
            )})`
          );
        }

        if (provider) {
          const network = await provider.getNetwork();
          setNetworkChainId(network.chainId);
          setShowNetworkModal(
            network.chainId !== BigInt(networkConfig.chainIdNum)
          );
        }
      } catch (error) {
        if (!silent) {
          setStatus(`Refresh failed: ${error.message}`);
        }
      } finally {
        if (!silent) setBusyAction(null);
      }
    },
    []
  );

  return {
    assets,
    riskState,
    shares,
    lastExec,
    canExecute,
    canExecuteReason,
    riskScoreVal,
    timeUntilNext,
    cycleCountVal,
    configLocked,
    algoMetrics,
    previewDecision,
    totalAssetsRaw,
    asterManagedAssets,
    secondaryManagedAssets,
    lpManagedAssets,
    lpAdapterAddress,
    lpStakingInfo,
    bufferStatus,
    pendingWithdrawals,
    userTokenBalance,
    idleBufferBps,
    breakerStatus,
    sharpeMetrics,
    auctionMetrics,
    arbPreview,
    vaultHealthScore,
    vaultHealthLabel,
    harvestGasEstimate,
    harvestGasMultiplier,
    refresh,
    toSafeNumber,
  };
}
