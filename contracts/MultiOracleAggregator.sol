// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MultiOracleAggregator
 * @notice Aggregates multiple price oracles and ensures consensus within a deviation threshold.
 */
contract MultiOracleAggregator is IPriceOracle, Ownable {
    IPriceOracle[] public oracles;
    uint256 public constant MAX_DEVIATION_BPS = 300; // 3%
    uint256 public constant BPS_DENOMINATOR = 10_000;
    bool public configurationLocked;

    error MultiOracle__InvalidOracleCount();
    error MultiOracle__DeviationTooHigh(uint256 priceA, uint256 priceB);
    error MultiOracle__ConfigurationLocked();

    constructor(address[] memory oracles_, address initialOwner) Ownable(initialOwner) {
        if (oracles_.length < 2) revert MultiOracle__InvalidOracleCount();
        for (uint256 i = 0; i < oracles_.length; i++) {
            oracles.push(IPriceOracle(oracles_[i]));
        }
    }

    /**
     * @notice Fetches prices from all oracles, verifies consensus, and returns the average.
     */
    function getPrice() external view override returns (uint256) {
        uint256 count = oracles.length;
        uint256[] memory prices = new uint256[](count);
        uint256 totalPrice = 0;

        for (uint256 i = 0; i < count; i++) {
            // Note: We don't check .locked() here because underlying oracles 
            // like Chainlink are always locked (immutable).
            // getPrice() will revert if data is stale or invalid.
            prices[i] = oracles[i].getPrice();
            totalPrice += prices[i];
        }

        // Simple deviation check between all pairs (for small counts like 2-3)
        for (uint256 i = 0; i < count; i++) {
            for (uint256 j = i + 1; j < count; j++) {
                _checkDeviation(prices[i], prices[j]);
            }
        }

        return totalPrice / count;
    }

    /**
     * @notice Returns true if the aggregator configuration is locked.
     */
    function locked() external view override returns (bool) {
        return configurationLocked;
    }

    function _checkDeviation(uint256 a, uint256 b) internal pure {
        uint256 diff = a > b ? a - b : b - a;
        uint256 avg = (a + b) / 2;
        if ((diff * BPS_DENOMINATOR) / avg > MAX_DEVIATION_BPS) {
            revert MultiOracle__DeviationTooHigh(a, b);
        }
    }

    // --- Admin ---
    function lockConfiguration() external onlyOwner {
        configurationLocked = true;
        renounceOwnership();
    }

    function updateOracles(address[] calldata oracles_) external onlyOwner {
        if (configurationLocked) revert MultiOracle__ConfigurationLocked();
        if (oracles_.length < 2) revert MultiOracle__InvalidOracleCount();
        delete oracles;
        for (uint256 i = 0; i < oracles_.length; i++) {
            oracles.push(IPriceOracle(oracles_[i]));
        }
    }
}
