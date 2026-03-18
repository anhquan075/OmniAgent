import React from "react";
import { VaultDutchAuctionCard } from "@/components/shared/cards/VaultCircuitBreakerThreeSignalStatusCard";
import { VaultCycleExecutionStatusCard } from "@/components/shared/cards/VaultCycleExecutionStatusCard";
import { VaultExecutionAuctionRraBidCard } from "@/components/shared/cards/VaultExecutionAuctionRraBidCard";
import { VaultOraclePolicyMetricsCard } from "@/components/shared/cards/VaultOraclePolicyMetricsCard";
import { VaultPegArbOpportunityAndHistoryCard } from "@/components/shared/cards/VaultPegArbOpportunityAndHistoryCard";
import { VaultSharpeRatioYieldTrackerCard } from "@/components/shared/cards/VaultSharpeRatioYieldTrackerCard";
import { VaultStrategyAllocationBarCard } from "@/components/shared/cards/VaultStrategyAllocationBarCard";
import { VaultTransactionHistoryCard } from "@/components/shared/cards/VaultTransactionHistoryCard";
import { VaultTvlStatsDepositWithdrawCard } from "@/components/shared/cards/VaultTvlStatsDepositWithdrawCard";
import { VaultTopNavbar } from "@/components/shared/ui/VaultTopNavbar";
import { useRainbowKitWallet } from "@/hooks/useRainbowKitWallet";
import { useVaultV2ReadState } from "@/hooks/useVaultV2ReadState";
import { useVaultV2WriteActions } from "@/hooks/useVaultV2WriteActions";
import { useNetworkMode } from "@/hooks/useNetworkMode";
import { NETWORK_CONFIGS, NETWORK_MODE } from "@/lib/networkConfig";
import { ZERO_ADDRESS as ZERO_ADDR } from "@/lib/constants";
import {
  AlertTriangle,
  ExternalLink,
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";
import { VaultTestnetDevPanel } from "@/components/shared/ui/VaultTestnetDevPanel";
import { HealthMonitorCard } from "@/components/shared/cards/HealthMonitorCard";
import { X402PaymentCard } from "@/components/shared/cards/X402PaymentCard";
import { useHealthMonitor } from "@/hooks/useHealthMonitor";
import { useX402Payment } from "@/hooks/useX402Payment";
import { useCallback, useEffect, useMemo, useState } from "react";

function shortAddr(addr) {
  if (!addr || addr === ZERO_ADDR) return "not deployed";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function shortHash(hash) {
  if (!hash) return "pending";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function ContractAddressBadge({ label, address, icon: Icon, bscScanAddr }) {
  const isSet = address && address !== ZERO_ADDR;
  return (
    <span
      className={`contractBadge ${
        isSet ? "contractBadge--set" : "contractBadge--unset"
      }`}
    >
      {Icon && (
        <Icon
          size={12}
          style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }}
        />
      )}
      <span className="contractBadgeLabel">{label}</span>
      {isSet ? (
        <a
          href={`${bscScanAddr}${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="contractBadgeAddr"
        >
          {shortAddr(address)}{" "}
          <ExternalLink
            size={10}
            style={{ display: "inline", verticalAlign: "middle" }}
          />
        </a>
      ) : (
        <span className="contractBadgeAddr">not deployed</span>
      )}
    </span>
  );
}

export default function OmniAgentVaultV2Client() {
  const [, setStatus] = useState("Loading live data...");
  const [busyAction, setBusyAction] = useState(null);
  const { networkMode, isTestnet, setNetworkMode } = useNetworkMode();
  const networkConfig = NETWORK_CONFIGS[networkMode];
  const {
    vaultAddress,
    engineAddress,
    tokenAddress,
    circuitBreakerAddress,
    sharpeTrackerAddress,
    pegArbExecutorAddress,
    executionAuctionAddress,
  } = networkConfig.contracts;
  const bscScanAddr = `${networkConfig.blockExplorer}/address/`;
  const bscScanTx = `${networkConfig.blockExplorer}/tx/`;

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [decimals, setDecimals] = useState(null);
  const [shareDecimals, setShareDecimals] = useState(null);
  const [publicProvider, setPublicProvider] = useState(null);
  const [screenTxPush, setScreenTxPush] = useState(null);
  const [lastLiveSyncAt, setLastLiveSyncAt] = useState(null);

  const isBusy = busyAction !== null;
  const wallet = useRainbowKitWallet();
  const { isConnected } = wallet;
  const vaultState = useVaultV2ReadState();
  const actions = useVaultV2WriteActions({ refresh: vaultState.refresh });
  const healthMonitor = useHealthMonitor(wallet.wallet);
  const x402Payment = useX402Payment();

  const refreshArgs = useMemo(
    () => ({
      signer: wallet.signer,
      provider: wallet.provider ?? publicProvider,
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
      setNetworkChainId: () => {},
      setShowNetworkModal: () => {},
    }),
    [
      wallet.signer,
      wallet.provider,
      publicProvider,
      vaultAddress,
      engineAddress,
      tokenAddress,
      circuitBreakerAddress,
      sharpeTrackerAddress,
      pegArbExecutorAddress,
      decimals,
      shareDecimals,
    ]
  );

  // Auto-sync UI network mode when wallet switches chains.
  // Chain 97 → testnet
  useEffect(() => {
    if (wallet.networkChainId === 97n)
      setNetworkMode(NETWORK_MODE.TESTNET);
  }, [wallet.networkChainId, setNetworkMode]);

  // Clear transaction history when wallet disconnects
  useEffect(() => {
    if (!wallet.isConnected) {
      actions.clearTxHistory();
    }
  }, [wallet.isConnected, actions]);

  useEffect(() => {
    import("ethers").then(({ JsonRpcProvider }) => {
      setPublicProvider(new JsonRpcProvider(networkConfig.rpcUrl));
    });
  }, [networkConfig.rpcUrl]);

  useEffect(() => {
    if (publicProvider && !wallet.signer) {
      vaultState.refresh({
        ...refreshArgs,
        signer: null,
        provider: publicProvider,
      });
      setLastLiveSyncAt(Date.now());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicProvider]);

  useEffect(() => {
    if (wallet.signer) {
      vaultState.refresh(refreshArgs);
      setLastLiveSyncAt(Date.now());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.signer]);

  useEffect(() => {
    const runnerProvider = wallet.provider ?? publicProvider;
    if (!runnerProvider) return;

    let cancelled = false;
    const runSilentRefresh = async () => {
      await vaultState.refresh({
        ...refreshArgs,
        signer: wallet.signer,
        provider: runnerProvider,
        silent: true,
      });
      if (!cancelled) setLastLiveSyncAt(Date.now());
    };

    runSilentRefresh();
    const intervalId = setInterval(() => {
      if (
        typeof document === "undefined" ||
        document.visibilityState === "visible"
      ) {
        runSilentRefresh();
      }
    }, 8000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") runSilentRefresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [
    wallet.signer,
    wallet.provider,
    publicProvider,
    refreshArgs,
    vaultState.refresh,
  ]);

  const handleDeposit = useCallback(
    () =>
      actions.deposit({
        signer: wallet.signer,
        vaultAddress,
        tokenAddress,
        depositAmount,
        decimals,
        setBusyAction,
        setStatus,
        refreshArgs,
      }),
    [
      actions,
      wallet.signer,
      vaultAddress,
      tokenAddress,
      depositAmount,
      decimals,
      refreshArgs,
    ]
  );

  const handleWithdraw = useCallback(
    () =>
      actions.withdraw({
        signer: wallet.signer,
        vaultAddress,
        withdrawAmount,
        decimals,
        setBusyAction,
        setStatus,
        refreshArgs,
      }),
    [
      actions,
      wallet.signer,
      vaultAddress,
      withdrawAmount,
      decimals,
      refreshArgs,
    ]
  );

  const handleExecuteCycle = useCallback(
    () =>
      actions.executeCycle({
        signer: wallet.signer,
        engineAddress,
        circuitBreakerAddress,
        canExecute: vaultState.canExecute,
        canExecuteReason: vaultState.canExecuteReason,
        setBusyAction,
        setStatus,
        refreshArgs,
      }),
    [
      actions,
      wallet.signer,
      engineAddress,
      circuitBreakerAddress,
      vaultState.canExecute,
      vaultState.canExecuteReason,
      refreshArgs,
    ]
  );

  const handleExecuteArb = useCallback(
    () =>
      actions.executeArbitrage({
        signer: wallet.signer,
        pegArbExecutorAddress,
        setBusyAction,
        setStatus,
        refreshArgs,
      }),
    [actions, wallet.signer, pegArbExecutorAddress, refreshArgs]
  );

  // Testnet: silent refresh after minting mock tokens
  const handleMinted = useCallback(() => {
    const runnerProvider = wallet.provider ?? publicProvider;
    if (runnerProvider) {
      vaultState.refresh({
        ...refreshArgs,
        signer: wallet.signer,
        provider: runnerProvider,
        silent: true,
      });
      setLastLiveSyncAt(Date.now());
    }
  }, [wallet.provider, publicProvider, wallet.signer, refreshArgs, vaultState]);

  // Unsupported = connected to a chain that is not BNB testnet.
  const networkSupported =
    wallet.networkChainId === null ||
    wallet.networkChainId === 97n;
  const depositsBlocked = vaultState.configLocked === false;
  const latestTx = actions.txHistory?.[0] ?? null;
  const latestTxId = latestTx?.id;
  const liveLabel = lastLiveSyncAt
    ? `Live data every 8s · last sync ${new Date(
        lastLiveSyncAt
      ).toLocaleTimeString()}`
    : "Live data initializing...";

  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => {
      setIsOffline(false);
      // Force a sync immediately when coming back online
      const runnerProvider = wallet.provider ?? publicProvider;
      if (runnerProvider) {
        vaultState.refresh({
          ...refreshArgs,
          signer: wallet.signer,
          provider: runnerProvider,
          silent: true,
        });
        setLastLiveSyncAt(Date.now());
      }
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    // Initial check
    if (!navigator.onLine) setIsOffline(true);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [wallet.provider, publicProvider, wallet.signer, refreshArgs, vaultState]);

  useEffect(() => {
    if (!latestTxId) {
      setScreenTxPush(null);
      return;
    }
    setScreenTxPush(latestTx);
    const timer = setTimeout(() => setScreenTxPush(null), 5000);
    return () => clearTimeout(timer);
  }, [latestTxId, latestTx]);

  return (
    <section className="panel panel--enhanced">
      <VaultTopNavbar busyAction={busyAction} />

      {(isTestnet) && (
        <VaultTestnetDevPanel
          tokenAddress={tokenAddress}
          signer={wallet.signer}
          walletAddress={wallet.wallet}
          userTokenBalance={vaultState.userTokenBalance}
          decimals={decimals}
          totalAssetsRaw={vaultState.totalAssetsRaw}
          cycleCountVal={vaultState.cycleCountVal}
          blockExplorer={networkConfig.blockExplorer}
          onMinted={handleMinted}
          networkLabel={networkConfig.label}
          chainIdNum={networkConfig.chainIdNum}
        />
      )}

      {/* Live sync badge removed from normal flow, moved to offline push notification */}

      {isOffline && (
        <div
          className={`globalTxPush globalTxPush--failed`}
          role="status"
          aria-live="polite"
        >
          <div className="globalTxPushTitle">CONNECTION LOST</div>
          <div className="globalTxPushBody">
            <span>Live data paused. Waiting for network...</span>
          </div>
        </div>
      )}

      {screenTxPush && !isOffline && (
        <div
          className={`globalTxPush globalTxPush--${screenTxPush.outcome}`}
          role="status"
          aria-live="polite"
        >
          <div className="globalTxPushTitle">New Transaction</div>
          <div className="globalTxPushBody">
            <span>
              {screenTxPush.action} · {screenTxPush.outcome}
            </span>
            {screenTxPush.hash ? (
              <a
                href={`${bscScanTx}${screenTxPush.hash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortHash(screenTxPush.hash)}{" "}
                <ExternalLink
                  size={10}
                  style={{ display: "inline", verticalAlign: "middle" }}
                />
              </a>
            ) : (
              <span>pending details</span>
            )}
          </div>
        </div>
      )}

      {!networkSupported && (
        <div className="networkStrip">
          <AlertTriangle
            size={14}
            style={{
              display: "inline",
              verticalAlign: "middle",
              marginRight: 6,
            }}
          />
          Unsupported network ({wallet.networkLabel}). Switch your wallet to{" "}
          <strong>BNB Testnet (97)</strong>.
        </div>
      )}

      {depositsBlocked && (
        <div className="networkStrip">
          <AlertTriangle
            size={14}
            style={{
              display: "inline",
              verticalAlign: "middle",
              marginRight: 8,
            }}
          />
          Deposits are blocked: vault configuration is not locked. Admin must
          call <code>lockConfiguration()</code> on the vault contract to enable
          deposits.
        </div>
      )}

      {/* V2 Contract address strip — 3-rail: Vault, Engine, CircuitBreaker, SharpeTracker, PegArb, Auction */}
      <div className="contractStrip contractStrip--v2">
        <div className="contractGroup contractGroup--core">
          <ContractAddressBadge
            label="Vault"
            address={vaultAddress}
            bscScanAddr={bscScanAddr}
          />
          <ContractAddressBadge
            label="Engine"
            address={engineAddress}
            bscScanAddr={bscScanAddr}
          />
        </div>
        <div className="contractGroup contractGroup--advanced">
          <ContractAddressBadge
            label="CircuitBreaker"
            address={circuitBreakerAddress}
            icon={Shield}
            bscScanAddr={bscScanAddr}
          />
          <ContractAddressBadge
            label="SharpeTracker"
            address={sharpeTrackerAddress}
            icon={TrendingUp}
            bscScanAddr={bscScanAddr}
          />
          <ContractAddressBadge
            label="PegArb"
            address={pegArbExecutorAddress}
            icon={Zap}
            bscScanAddr={bscScanAddr}
          />
          <ContractAddressBadge
            label="Execution Auction"
            address={executionAuctionAddress}
            icon={Zap}
            bscScanAddr={bscScanAddr}
          />
        </div>
      </div>

      {/* V2 Dashboard */}
      <div className="v2-dash-layout">
        {/* ── Row 1: Hero TVL & Status ── */}
        <div className="bento-section-header">
          <span className="bento-section-label">Vault Overview</span>
          <span className="bento-section-line" />
        </div>
        <div className="bento-row-flex">
          <div className="bento-row-main" style={{ flex: 7 }}>
            <VaultTvlStatsDepositWithdrawCard
              assets={vaultState.assets}
              shares={vaultState.shares}
              riskState={vaultState.riskState}
              cycleCountVal={vaultState.cycleCountVal}
              decimals={decimals}
              shareDecimals={shareDecimals}
              configLocked={vaultState.configLocked}
              walletAddress={wallet.wallet}
              isConnected={isConnected}
              canOperate={!!wallet.signer && !isBusy}
              depositAmount={depositAmount}
              setDepositAmount={setDepositAmount}
              withdrawAmount={withdrawAmount}
              setWithdrawAmount={setWithdrawAmount}
              onDeposit={handleDeposit}
              onWithdraw={handleWithdraw}
              isBusy={isBusy}
              busyAction={busyAction}
              totalAssetsRaw={vaultState.totalAssetsRaw}
              wdkManagedAssets={vaultState.wdkManagedAssets}
              userTokenBalance={vaultState.userTokenBalance}
            />
          </div>
          <div className="bento-row-side" style={{ flex: 3 }}>
            <VaultDutchAuctionCard auctionState={vaultState.auctionMetrics} />
            <HealthMonitorCard 
              positionData={healthMonitor.positionData}
              alert={healthMonitor.alert}
              isLoading={healthMonitor.isLoading}
            />
          </div>
        </div>
        {/* ── Row 2: Execution + Arbitrage ── */}
        <div className="bento-section-header">
          <span className="bento-section-label">Execution Engine</span>
          <span className="bento-section-line" />
        </div>
        <div className="bento-row-flex">
          <div className="bento-row-main" style={{ flex: 7 }}>
            <VaultCycleExecutionStatusCard
              lastExec={vaultState.lastExec}
              canExecute={vaultState.canExecute}
              canExecuteReason={vaultState.canExecuteReason}
              riskState={vaultState.riskState}
              riskScoreVal={vaultState.riskScoreVal}
              timeUntilNext={vaultState.timeUntilNext}
              cycleCountVal={vaultState.cycleCountVal}
              canOperate={!!wallet.signer && !isBusy}
              busyAction={busyAction}
              onExecuteCycle={handleExecuteCycle}
              previewDecision={vaultState.previewDecision}
              vaultHealthScore={vaultState.vaultHealthScore}
              vaultHealthLabel={vaultState.vaultHealthLabel}
            />
          </div>
          <div className="bento-row-side" style={{ flex: 3 }}>
            <VaultPegArbOpportunityAndHistoryCard
              arbPreview={vaultState.arbPreview}
              onExecuteArb={handleExecuteArb}
              busyAction={busyAction}
            />
          </div>
        </div>

        {/* ── Row 3: Strategy + Auction + Oracle ── */}
        <div className="bento-section-header">
          <span className="bento-section-label">Strategy &amp; Analytics</span>
          <span className="bento-section-line" />
        </div>
        <div className="bento-row-thirds">
          <VaultStrategyAllocationBarCard
            wdkManagedAssets={vaultState.wdkManagedAssets}
            secondaryManagedAssets={vaultState.secondaryManagedAssets}
            lpManagedAssets={vaultState.lpManagedAssets}
            lpStakingInfo={vaultState.lpStakingInfo}
            pendingWithdrawals={vaultState.pendingWithdrawals}
            totalAssetsRaw={vaultState.totalAssetsRaw}
            bufferStatus={vaultState.bufferStatus}
            algoMetrics={vaultState.algoMetrics}
            harvestGasEstimate={vaultState.harvestGasEstimate}
            harvestGasMultiplier={vaultState.harvestGasMultiplier}
            rpcUrl={networkConfig.rpcUrl}
            vUSDTAddress={networkConfig.vUSDTAddress}
          />
          <VaultExecutionAuctionRraBidCard
            executionAuctionAddress={executionAuctionAddress}
            tokenAddress={tokenAddress}
            signer={wallet.signer}
            walletAddress={wallet.wallet}
            canOperate={!!wallet.signer && !isBusy}
            busyAction={busyAction}
            onBusyChange={setBusyAction}
            onStatus={setStatus}
          />
          <X402PaymentCard
            riskAnalysis={x402Payment.riskAnalysis}
            isLoading={x402Payment.isLoading}
            error={x402Payment.error}
            onAnalyze={x402Payment.analyzePayment}
          />
        </div>

        {/* ── Row 4: History ── */}
        <div className="bento-section-header">
          <span className="bento-section-label">Activity</span>
          <span className="bento-section-line" />
        </div>
        <VaultTransactionHistoryCard
          txHistory={actions.txHistory}
          onClear={actions.clearTxHistory}
          blockExplorer={networkConfig.blockExplorer}
        />
      </div>
    </section>
  );
}
