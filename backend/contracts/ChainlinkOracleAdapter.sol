// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IChainlinkAggregator} from "./interfaces/IChainlinkAggregator.sol";

/**
 * @title ChainlinkOracleAdapter
 * @notice Adapts Chainlink price feeds to IPriceOracle interface
 * @dev Wraps IChainlinkAggregator.latestRoundData() to IPriceOracle.getPrice()
 */
contract ChainlinkOracleAdapter is IPriceOracle {
    IChainlinkAggregator public immutable feed;
    uint256 public constant STALENESS_THRESHOLD = 3600; // 1 hour

    error FeedStale();
    error FeedInvalid();
    error FeedZeroTimestamp();
    error FeedIncompleteRound();

    constructor(address feedAddress) {
        feed = IChainlinkAggregator(feedAddress);
    }

    /**
     * @notice Returns price from Chainlink feed as uint256 (8 decimals)
     * @dev Converts int256 answer to uint256, reverts if stale or negative
     */
    function getPrice() external view override returns (uint256) {
        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) =
            feed.latestRoundData();

        // Check round completeness
        if (answeredInRound < roundId) revert FeedIncompleteRound();
        if (updatedAt == 0) revert FeedZeroTimestamp();
        if (answer <= 0) revert FeedInvalid();
        if (block.timestamp - updatedAt > STALENESS_THRESHOLD) revert FeedStale();

        return uint256(answer);
    }

    /**
     * @notice Returns true - Chainlink feeds are immutable after deploy
     */
    function locked() external pure override returns (bool) {
        return true;
    }
}
