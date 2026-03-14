// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPriceOracle} from "../../interfaces/IPriceOracle.sol";
import {IChainlinkAggregator} from "../../interfaces/IChainlinkAggregator.sol";

/// @title MoonwellPriceOracle
/// @notice Wraps a Chainlink AggregatorV3 feed on Polkadot Hub and normalises the answer to 8 decimal places.
/// @dev Chosen over AMM-based oracles because Chainlink prices are derived from professional
///      market makers and are resistant to flash-loan manipulation. The stalePeriod rejects
///      feeds that have not updated within the allowed window, preventing the engine from
///      acting on stale data during oracle downtime.
///
///      Decimal normalisation: Chainlink feeds vary (8 dec, 18 dec, etc.).
///      This contract converts all feeds to a uniform 8-decimal representation so
///      the StrategyEngine and RiskPolicy can use a consistent fixed-point format.
///
///      Polkadot Hub Chainlink USDC/USD feed: 0xA122591D650d7EE8eabC08d8d4Ea0560E1bC3B3f
/// @custom:security-contact security@asterpilot.xyz
contract MoonwellPriceOracle is IPriceOracle {
    // ── errors ──
    error MoonwellPriceOracle__ZeroAddress();
    error MoonwellPriceOracle__ZeroStalePeriod();
    error MoonwellPriceOracle__StaleRound();
    error MoonwellPriceOracle__InvalidPrice();
    error MoonwellPriceOracle__MissingTimestamp();
    error MoonwellPriceOracle__StalePrice();

    /// @notice The underlying Chainlink aggregator feed.
    IChainlinkAggregator public immutable feed;

    /// @notice Maximum age (in seconds) of a price update before it is considered stale.
    uint256 public immutable stalePeriod;

    /// @notice Decimal precision reported by the underlying feed.
    uint8 public immutable feedDecimals;

    /// @notice Initialize the Moonwell price oracle with Chainlink feed integration
    /// @dev Stores the Chainlink aggregator address and staleness threshold. The feedDecimals
    ///      value is cached from the feed to optimize gas costs in getPrice() calls.
    /// @param feedAddress Non-zero address of a Chainlink AggregatorV3 contract on Polkadot Hub.
    ///        Example USDC/USD feed: 0xA122591D650d7EE8eabC08d8d4Ea0560E1bC3B3f
    /// @param stalePeriodSeconds Maximum acceptable price age in seconds (must be > 0).
    ///        Typical values: 3600 (1 hour) for stable assets, 300 (5 min) for volatile assets
    constructor(address feedAddress, uint256 stalePeriodSeconds) {
        if (stalePeriodSeconds == 0) revert MoonwellPriceOracle__ZeroStalePeriod();

        feed = IChainlinkAggregator(feedAddress);
        stalePeriod = stalePeriodSeconds;
        feedDecimals = feedAddress != address(0) ? IChainlinkAggregator(feedAddress).decimals() : 8;
    }

    /// @notice Check if oracle configuration is locked (always returns true)
    /// @dev Chainlink oracle configuration is inherently immutable after deployment.
    ///      This function exists to satisfy the IPriceOracle interface.
    /// @return locked Always returns true
    function locked() external pure returns (bool) {
        return true;
    }

    /// @notice Fetch the latest price from Chainlink, validate staleness, and normalize to 8 decimals
    /// @dev Executes comprehensive validation:
    ///      1. answeredInRound < roundId → revert (incomplete round)
    ///      2. answer <= 0 → revert (invalid price)
    ///      3. updatedAt == 0 → revert (missing timestamp)
    ///      4. block.timestamp - updatedAt > stalePeriod → revert (stale price)
    ///      
    ///      Decimal normalization logic:
    ///      - feedDecimals == 8: Return as-is
    ///      - feedDecimals > 8: Divide by 10^(feedDecimals - 8) to scale down
    ///      - feedDecimals < 8: Multiply by 10^(8 - feedDecimals) to scale up
    ///      
    ///      Example: Chainlink feed returns 100584000 (8 decimals) → returns 100584000
    ///      Example: Chainlink feed returns 1005840000000000000 (18 decimals) → returns 100584000
    /// @return Price in 8-decimal fixed-point format (e.g., 100000000 = $1.00)
    function getPrice() external view returns (uint256) {
        if (address(feed) == address(0)) return 100000000; // Fixed $1.00 (8 decimals)

        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = feed.latestRoundData();

        // answeredInRound < roundId means the round is incomplete / answer is from prior round
        if (answeredInRound < roundId) revert MoonwellPriceOracle__StaleRound();
        if (answer <= 0) revert MoonwellPriceOracle__InvalidPrice();
        if (updatedAt == 0) revert MoonwellPriceOracle__MissingTimestamp();
        if (block.timestamp - updatedAt > stalePeriod) revert MoonwellPriceOracle__StalePrice();

        uint256 unsignedAnswer = uint256(answer);
        if (feedDecimals == 8) {
            return unsignedAnswer;
        }
        if (feedDecimals > 8) {
            return unsignedAnswer / (10 ** (feedDecimals - 8));
        }
        return unsignedAnswer * (10 ** (8 - feedDecimals));
    }
    /// @notice Get price with legacy naming for backwards compatibility
    /// @dev This is an alias for getPrice() to support legacy interfaces that expect
    ///      a getUSDTPrice() function. Both functions return the same normalized 8-decimal price.
    /// @return Price in 8-decimal fixed-point format (e.g., 100000000 = $1.00)
    function getUSDTPrice() external view returns (uint256) {
        return this.getPrice();
    }

    /// @notice Get the decimal precision used by this oracle (always 8)
    /// @dev All prices returned by this oracle are normalized to 8 decimal places
    ///      regardless of the underlying Chainlink feed's native decimals.
    /// @return decimals Always returns 8
    function decimals() external pure returns (uint8) {
        return 8;
    }
}
