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

// ── HashKey Chain ABIs ────────────────────────────────────────────────────────

export const kycSbtAbi = [
  "function getKycInfo(address account) view returns (string ensName, uint8 level, uint8 status, uint256 updatedAt)",
  "function isHuman(address account) view returns (bool isValid, uint8 level)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event KYCLevelUp(address indexed account, uint8 newLevel)",
];

export const hashkeyVaultAbi = [
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)",
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)",
  "function balanceOf(address account) view returns (uint256)",
  "function convertToShares(uint256 assets) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function maxDeposit(address receiver) view returns (uint256)",
  "function maxWithdraw(address owner) view returns (uint256)",
  "function asset() view returns (address)",
  "function kycSbt() view returns (address)",
  "function minKycLevel() view returns (uint8)",
  "function currentApy() view returns (uint256)",
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
];

export const policyGuardAbi = [
  "function validate(address receiver, uint256 amountUsdt, uint256 portfolioValueUsdt)",
  "function commit(uint256 amountUsdt)",
  "function isAuthorized(address agent) view returns (bool)",
  "function authorizedAgents(address) view returns (bool)",
  "function owner() view returns (address)",
  "event PolicyUpdated(bytes32 indexed operationHash, bool approved, string reason)",
  "event AgentAuthorized(address indexed agent)",
  "event AgentRevoked(address indexed agent)",
];

export const agentNfaAbi = [
  // Views
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function operatorOf(uint256 tokenId) view returns (address)",
  "function vaultOf(uint256 tokenId) view returns (address)",
  "function policyGuardOf(uint256 tokenId) view returns (address)",
  "function accountOf(uint256 tokenId) view returns (address)",
  "function nextTokenId() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function admin() view returns (address)",
  // Mutations
  "function mint(address to, address operator, address policyGuard) returns (uint256 tokenId)",
  "function execute(uint256 tokenId, tuple(address target, uint256 value, bytes data) action, uint256 portfolioValueUsdt) returns (bytes result)",
  "function executeBatch(uint256 tokenId, tuple(address target, uint256 value, bytes data)[] actions, uint256 portfolioValueUsdt) returns (bytes[] results)",
  "function setOperator(uint256 tokenId, address newOperator)",
  "function setPolicyGuard(uint256 tokenId, address newPolicyGuard)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event ActionExecuted(uint256 indexed tokenId, address target, uint256 value, bytes data)",
  "event BatchExecuted(uint256 indexed tokenId, uint256 actionCount)",
  "event OperatorUpdated(uint256 indexed tokenId, address oldOperator, address newOperator)",
  "event VaultDeployed(uint256 indexed tokenId, address vault)",
];

export const zkIdentityGateAbi = [
  "function verifier() view returns (address)",
  "function vault() view returns (address)",
  "function agentNFA() view returns (address)",
  "function nonces(address) view returns (uint256)",
  "function nullifierUsed(bytes32) view returns (bool)",
  "function proofOf(address) view returns (tuple(uint64 validUntil, uint32 agentTokenId, bytes32 nullifier, uint64 verifiedAt))",
  "function hasValidProof(address subject) view returns (bool)",
  "function submitProof(bytes proof, tuple(uint16 currentYear, uint8 requiredKycLevel, address subject, uint32 agentTokenId, uint64 proofValidUntil, bytes32 nullifier) publicInputs)",
  "function submitProofWithPermit(bytes proof, tuple(uint16 currentYear, uint8 requiredKycLevel, address subject, uint32 agentTokenId, uint64 proofValidUntil, bytes32 nullifier) publicInputs, uint256 deadline, bytes signature)",
  "function depositWithProof(uint256 assets, address receiver) returns (uint256 shares)",
  "event ProofAccepted(address indexed subject, uint32 indexed agentTokenId, bytes32 indexed nullifier, uint64 validUntil, address relayer)",
  "event GatedDeposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares)",
];
