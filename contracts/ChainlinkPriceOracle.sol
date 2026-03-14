// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IChainlinkAggregator} from "./interfaces/IChainlinkAggregator.sol";

/// @title ChainlinkPriceOracle
/// @notice Wraps a Chainlink AggregatorV3 feed and normalises the answer to 8 decimal places.
/// @dev Chosen over AMM-based oracles because Chainlink prices are derived from professional
///      market makers and are resistant to flash-loan manipulation. The stalePeriod rejects
///      feeds that have not updated within the allowed window, preventing the engine from
///      acting on stale data during oracle downtime.
///
///      Decimal normalisation: Chainlink feeds vary (8 dec, 18 dec, etc.).
///      This contract converts all feeds to a uniform 8-decimal representation so
///      the StrategyEngine and RiskPolicy can use a consistent fixed-point format.
/// @custom:security-contact security@asterpilot.xyz
contract ChainlinkPriceOracle is IPriceOracle {
    // ── errors ──
    error ChainlinkPriceOracle__ZeroAddress();
    error ChainlinkPriceOracle__ZeroStalePeriod();
    error ChainlinkPriceOracle__StaleRound();
    error ChainlinkPriceOracle__InvalidPrice();
    error ChainlinkPriceOracle__MissingTimestamp();
    error ChainlinkPriceOracle__StalePrice();

    /// @notice The underlying Chainlink aggregator feed.
    IChainlinkAggregator public immutable feed;

    /// @notice Maximum age (in seconds) of a price update before it is considered stale.
    uint256 public immutable stalePeriod;

    /// @notice Decimal precision reported by the underlying feed.
    uint8 public immutable feedDecimals;

    /// @param feedAddress Non-zero address of a Chainlink AggregatorV3 contract.
    /// @param stalePeriodSeconds Maximum acceptable price age in seconds (must be > 0).
    constructor(address feedAddress, uint256 stalePeriodSeconds) {
        if (feedAddress == address(0)) revert ChainlinkPriceOracle__ZeroAddress();
        if (stalePeriodSeconds == 0) revert ChainlinkPriceOracle__ZeroStalePeriod();

        feed = IChainlinkAggregator(feedAddress);
        stalePeriod = stalePeriodSeconds;
        feedDecimals = feed.decimals();
    }

    /// @notice Always returns true — Chainlink oracle configuration is inherently immutable.
    function locked() external pure returns (bool) {
        return true;
    }

    /// @notice Fetch the latest price, validate it, and normalise it to 8 decimal places.
    /// @dev Reverts on: stale round, non-positive answer, missing timestamp, or stale price.
    /// @return Price in 8-decimal fixed-point (e.g. 1_00000000 = $1.00).
    function getPrice() external view returns (uint256) {
        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) =
            feed.latestRoundData();

        // answeredInRound < roundId means the round is incomplete / answer is from prior round
        if (answeredInRound < roundId) revert ChainlinkPriceOracle__StaleRound();
        if (answer <= 0) revert ChainlinkPriceOracle__InvalidPrice();
        if (updatedAt == 0) revert ChainlinkPriceOracle__MissingTimestamp();
        if (block.timestamp - updatedAt > stalePeriod) revert ChainlinkPriceOracle__StalePrice();

        uint256 unsignedAnswer = uint256(answer);
        if (feedDecimals == 8) {
            return unsignedAnswer;
        }
        if (feedDecimals > 8) {
            return unsignedAnswer / (10 ** (feedDecimals - 8));
        }
        return unsignedAnswer * (10 ** (8 - feedDecimals));
    }
}
