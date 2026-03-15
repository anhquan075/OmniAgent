export const vaultAbi = [
  "function totalAssets() view returns (uint256)",
  "function deposit(uint256 assets,address receiver) returns (uint256)",
  "function withdraw(uint256 assets,address receiver,address owner) returns (uint256)",
  "function maxWithdraw(address owner) view returns (uint256)",
  "function maxDeposit(address receiver) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function configurationLocked() view returns (bool)",
  "function wdkAdapter() view returns (address)",
  "function secondaryAdapter() view returns (address)",
  "function asset() view returns (address)",
];

/// Minimal ABI for reading managed balance from any IManagedAdapter implementation.
export const managedAdapterAbi = ["function managedAssets() view returns (uint256)"];

/// ABI for StableSwapLPYieldAdapterWithFarm (farm integration)
export const farmAdapterAbi = [
  "function managedAssets() view returns (uint256)",
  "function stakingInfo() view returns (uint256 staked, uint256 unstaked, uint256 pending)",
  "function pendingRewards() view returns (uint256)",
  "function harvestRewards() returns (uint256)",
  "function harvestGasEstimate() view returns (uint256)",
  "function harvestGasMultiplier() view returns (uint256)",
  "event HarvestSkippedUnprofitable(uint256 cakeValue, uint256 gasCost)",
];

export const engineAbi = [
  "function executeCycle()",
  "function canExecute() view returns (bool,bytes32)",
  "function currentState() view returns (uint8)",
  "function lastExecution() view returns (uint256)",
  "function lastPrice() view returns (uint256)",
  "function policy() view returns (address)",
  "function priceOracle() view returns (address)",
  "function riskScore() view returns (uint256)",
  "function timeUntilNextCycle() view returns (uint256)",
  "function cycleCount() view returns (uint256)",
  "function previewDecision() view returns (tuple(bool executable, bytes32 reason, uint8 nextState, uint256 price, uint256 previousPrice, uint256 volatilityBps, uint256 targetWDKBps, uint256 bountyBps) preview)",
];

export const erc20Abi = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
];

export const policyAbi = [
  "function guardedVolatilityBps() view returns (uint256)",
  "function drawdownVolatilityBps() view returns (uint256)",
  "function depegPrice() view returns (uint256)",
  "function normalWDKBps() view returns (uint256)",
  "function guardedWDKBps() view returns (uint256)",
  "function drawdownWDKBps() view returns (uint256)",
];

export const oracleAbi = ["function getPrice() view returns (uint256)"];

// ── V2 ABIs ──────────────────────────────────────────────────────────────────

export const vaultV2Abi = [
  ...vaultAbi,
  "function lpAdapter() view returns (address)",
  "function rebalance(uint256 wdkTargetBps, uint256 maxSlippageBps, address executor, uint256 bountyBps, uint256 lpTargetBps) external",
  "function idleBufferBps() view returns (uint256)",
  "function bufferStatus() view returns (uint256 bufferTarget, uint256 idleBalance, uint256 utilizationBps)",
  "function pegArbExecutor() view returns (address)",
  "function rawTotalAssets() view returns (uint256)",
  "function calculateLockedProfit() view returns (uint256)",
  "function lockedProfit() view returns (uint256)",
  "function lastReport() view returns (uint256)",
  "function withdrawYield(address receiver) returns (uint256)",
  "event AutoHarvestTriggered(uint256 harvested)",
];

export const engineV2Abi = [
  ...engineAbi.filter(f => !f.includes("previewDecision")),
  "function circuitBreaker() view returns (address)",
  "function sharpeTracker() view returns (address)",
  "function previewDecision() view returns (tuple(bool executable, bytes32 reason, uint8 nextState, uint256 price, uint256 previousPrice, uint256 volatilityBps, uint256 targetWDKBps, uint256 targetLpBps, uint256 bountyBps, bool breakerPaused, int256 meanYieldBps, uint256 yieldVolatilityBps, int256 sharpeRatio, uint256 auctionElapsedSeconds, uint256 bufferUtilizationBps) preview)",
  "function previewAuction() view returns (uint256 currentBountyBps, uint256 elapsedSeconds, uint256 remainingSeconds, uint256 minBountyBps, uint256 maxBountyBps)",
  "function previewSharpe() view returns (int256 mean, uint256 volatility, int256 sharpe)",
  "function previewBreaker() view returns (tuple(bool paused, bool signalA, bool signalB, bool signalC, uint256 lastTripTimestamp, uint256 recoveryTimestamp) status)",
  "function checkUpkeep(bytes calldata) view returns (bool upkeepNeeded, bytes memory performData)",
  "function performUpkeep(bytes calldata)",
];

export const executionAuctionAbi = [
  "function bid(uint256 amount) external",
  "function winnerExecute() external",
  "function fallbackExecute() external",
  "function claimRefund() external",
  "function roundStatus() external view returns (uint256 id, uint8 currentPhase, address winner, uint256 winningBid, uint256 bidTimeRemaining, uint256 executeTimeRemaining)",
  "function stats() external view returns (uint256 totalRounds, uint256 bidRevenue, uint8 currentPhase_)",
  "function pendingRefunds(address) external view returns (uint256)",
  "function bidWindow() external view returns (uint256)",
  "function executeWindow() external view returns (uint256)",
  "function minBid() external view returns (uint256)",
  "function minBidIncrementBps() external view returns (uint256)",
];

export const policyV2Abi = [
  ...policyAbi,
  "function minBountyBps() view returns (uint256)",
  "function auctionDurationSeconds() view returns (uint256)",
  "function idleBufferBps() view returns (uint256)",
  "function sharpeWindowSize() view returns (uint8)",
  "function sharpeLowThreshold() view returns (uint256)",
];

export const pegArbAbi = [
  "function previewArb() view returns (tuple(uint8 direction, uint256 estimatedProfitBps, uint256 tradeSize, uint256 poolPrice) preview)",
  "function executeArb() returns (uint256 profit)",
  "function minProfitBps() view returns (uint256)",
  "function deviationThresholdBps() view returns (uint256)",
];

export const circuitBreakerAbi = [
  "function isPaused() view returns (bool)",
  "function previewBreaker() view returns (tuple(bool paused, bool signalA, bool signalB, bool signalC, uint256 lastTripTimestamp, uint256 recoveryTimestamp) status)",
  "function checkBreaker() returns (bool paused)",
];
