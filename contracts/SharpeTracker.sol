// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title SharpeTracker — Rolling on-chain Sharpe & Sortino ratio tracker
/// @notice Circular buffer of yield observations with access-controlled recording.
///         Computes mean yield, volatility (sample variance), Sharpe ratio, and Sortino ratio.
/// @dev    Used by StrategyEngine to record per-cycle yield and expose analytics.
///         O(1) per record, O(N) for compute where N = windowSize (max 30).
///         recordYield is restricted to the engine address to prevent data injection.
/// @custom:security-contact security@wdkpilot.xyz
contract SharpeTracker {
    uint8 public constant MAX_WINDOW = 30;
    uint8 public constant MIN_WINDOW = 3;
    uint256 public constant SHARPE_SCALE = 10_000;

    // ── errors ──
    error SharpeTracker__WindowOutOfRange();
    error SharpeTracker__OnlyEngine();
    error SharpeTracker__EngineAlreadySet();
    error SharpeTracker__ZeroAddress();
    error SharpeTracker__CallerNotDeployer();

    // ── state ──
    int128[30] public observations;
    uint8 public index;
    uint8 public count;
    uint8 public immutable windowSize;
    /// @dev Stored at construction so setEngine() cannot be front-run by a third party.
    address private immutable _deployer;
    address public engine;

    // ── downside tracking for Sortino ──
    uint256 public downsideSquaredSum;
    uint8 public downsideCount;

    event YieldRecorded(int128 yieldBps, uint8 count);

    modifier onlyEngine() {
        if (msg.sender != engine) revert SharpeTracker__OnlyEngine();
        _;
    }

    constructor(uint8 windowSize_) {
        if (windowSize_ < MIN_WINDOW || windowSize_ > MAX_WINDOW) revert SharpeTracker__WindowOutOfRange();
        windowSize = windowSize_;
        _deployer = msg.sender;
    }

    /*//////////////////////////////////////////////////////////////
                          STATE-CHANGING FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice One-time engine address setter (resolves circular deploy dependency).
    /// @dev Restricted to the original deployer address so it cannot be front-run.
    ///      Call this immediately after deploying StrategyEngine.
    /// @param engine_ The StrategyEngine address that will call recordYield
    function setEngine(address engine_) external {
        if (msg.sender != _deployer) revert SharpeTracker__CallerNotDeployer();
        if (engine != address(0)) revert SharpeTracker__EngineAlreadySet();
        if (engine_ == address(0)) revert SharpeTracker__ZeroAddress();
        engine = engine_;
    }

    /// @notice Record a new yield observation (in basis points, signed).
    /// @dev Restricted to engine — prevents external data injection attacks.
    /// @param yieldBps Per-cycle yield: ((totalAssets_now - totalAssets_prev) * 10000) / totalAssets_prev
    function recordYield(int128 yieldBps) external onlyEngine {
        // If overwriting an old observation in circular buffer, subtract its downside contribution
        if (count == windowSize) {
            int128 old = observations[index];
            if (old < 0) {
                uint256 oldSq = uint256(int256(old) * int256(old));
                downsideSquaredSum = downsideSquaredSum > oldSq ? downsideSquaredSum - oldSq : 0;
                downsideCount = downsideCount > 0 ? downsideCount - 1 : 0;
            }
        }

        observations[index] = yieldBps;
        index = uint8((uint256(index) + 1) % uint256(windowSize));
        if (count < windowSize) {
            count++;
        }

        // Track downside for Sortino
        if (yieldBps < 0) {
            downsideSquaredSum += uint256(int256(yieldBps) * int256(yieldBps));
            downsideCount++;
        }

        emit YieldRecorded(yieldBps, count);
    }

    /*//////////////////////////////////////////////////////////////
                              VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Compute rolling Sharpe ratio from stored observations
    /// @dev Uses Bessel's correction (N-1 denominator) for sample variance
    /// @return mean       Mean yield in bps (signed)
    /// @return volatility Standard deviation in bps (unsigned)
    /// @return sharpe     Sharpe ratio scaled by SHARPE_SCALE; 0 if count < MIN_WINDOW
    function computeSharpe()
        external
        view
        returns (int256 mean, uint256 volatility, int256 sharpe)
    {
        if (count < MIN_WINDOW) {
            return (0, 0, 0);
        }

        // Compute mean
        int256 sum;
        for (uint8 i; i < count; i++) {
            sum += int256(observations[i]);
        }
        mean = sum / int256(uint256(count));

        // Compute sample variance (Bessel's correction: N-1 denominator)
        uint256 varianceSum;
        for (uint8 i; i < count; i++) {
            int256 diff = int256(observations[i]) - mean;
            varianceSum += uint256(diff * diff);
        }

        // Use N-1 for sample variance when count > 1
        uint256 variance;
        if (count > 1) {
            variance = varianceSum / uint256(count - 1);
        }

        // Standard deviation via Babylonian sqrt
        volatility = _sqrt(variance);

        // Sharpe = mean * SHARPE_SCALE / stddev
        if (volatility == 0) {
            sharpe = mean > 0 ? int256(SHARPE_SCALE) : (mean < 0 ? -int256(SHARPE_SCALE) : int256(0));
        } else {
            sharpe = (mean * int256(SHARPE_SCALE)) / int256(volatility);
        }
    }

    /// @notice Compute Sortino ratio (downside-risk-adjusted return)
    /// @dev Sortino uses only negative yield observations for volatility calculation
    /// @return mean              Mean yield in bps (signed)
    /// @return downsideVolatility Downside deviation in bps (unsigned)
    /// @return sortino           Sortino ratio scaled by SHARPE_SCALE; 0 if insufficient data
    function computeSortino()
        external
        view
        returns (int256 mean, uint256 downsideVolatility, int256 sortino)
    {
        if (count < MIN_WINDOW) {
            return (0, 0, 0);
        }

        // Compute mean
        int256 sum;
        for (uint8 i; i < count; i++) {
            sum += int256(observations[i]);
        }
        mean = sum / int256(uint256(count));

        // Downside volatility from tracked downside squared sum
        if (downsideCount > 1) {
            uint256 downsideVariance = downsideSquaredSum / uint256(downsideCount - 1);
            downsideVolatility = _sqrt(downsideVariance);
        } else if (downsideCount == 1) {
            downsideVolatility = _sqrt(downsideSquaredSum);
        }

        // Sortino = mean * SHARPE_SCALE / downsideVolatility
        if (downsideVolatility == 0) {
            sortino = mean > 0 ? int256(SHARPE_SCALE) : (mean < 0 ? -int256(SHARPE_SCALE) : int256(0));
        } else {
            sortino = (mean * int256(SHARPE_SCALE)) / int256(downsideVolatility);
        }
    }

    /// @notice Get the latest N observations (oldest to newest)
    /// @return obs Array of recorded yield observations
    /// @return len Number of valid entries
    function getObservations()
        external
        view
        returns (int128[30] memory obs, uint8 len)
    {
        obs = observations;
        len = count;
    }

    /*//////////////////////////////////////////////////////////////
                          INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @dev Babylonian integer square root
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
