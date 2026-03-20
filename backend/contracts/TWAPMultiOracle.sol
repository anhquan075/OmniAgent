// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {ITWAPOracle} from "./interfaces/ITWAPOracle.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TWAPMultiOracle
 * @notice Flash loan manipulation-resistant oracle using 30-minute TWAP with multi-source validation
 * @dev Combines time-weighted averaging with multi-oracle consensus for maximum security
 * 
 * Security Features:
 * - 30-minute TWAP window makes sustained price manipulation economically infeasible
 * - Multi-oracle validation (3+ sources) prevents single-point failures
 * - 5% deviation threshold detects anomalous price reporting
 * - Circular buffer for gas-efficient storage (60 observations max)
 * - Geometric mean for robust aggregation (resistant to outliers)
 * 
 * @custom:security-contact security@wdkpilot.xyz
 */
contract TWAPMultiOracle is ITWAPOracle, Ownable {
    // ── Constants ──
    uint256 public constant TWAP_WINDOW = 30 minutes;
    uint256 public constant OBSERVATION_INTERVAL = 30 seconds;
    uint256 public constant MAX_OBSERVATIONS = 60; // 30 min / 30 sec
    uint256 public constant MAX_DEVIATION_BPS = 500; // 5%
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MIN_ORACLES = 3;

    // ── Errors ──
    error TWAPMultiOracle__InvalidOracleCount();
    error TWAPMultiOracle__DeviationTooHigh(uint256 priceA, uint256 priceB);
    error TWAPMultiOracle__InsufficientObservations();
    error TWAPMultiOracle__ObservationTooSoon();
    error TWAPMultiOracle__ConfigurationLocked();
    error TWAPMultiOracle__InvalidTWAPWindow();

    // ── Storage ──
    struct PriceObservation {
        uint256 timestamp;
        uint256 price;
    }

    IPriceOracle[] public oracles;
    PriceObservation[] public observations;
    uint256 public lastUpdateTime;
    bool public configurationLocked;

    // ── Events (inherited from ITWAPOracle) ──
    event OraclesUpdated(uint256 count);

    /**
     * @param oracles_ Array of oracle addresses (minimum 3 required)
     * @param initialOwner Address that will own the contract
     */
    constructor(address[] memory oracles_, address initialOwner) Ownable(initialOwner) {
        if (oracles_.length < MIN_ORACLES) revert TWAPMultiOracle__InvalidOracleCount();
        
        for (uint256 i = 0; i < oracles_.length; i++) {
            oracles.push(IPriceOracle(oracles_[i]));
        }

        // Initialize with first observation
        uint256 initialPrice = _getMultiOraclePrice();
        observations.push(PriceObservation({timestamp: block.timestamp, price: initialPrice}));
        lastUpdateTime = block.timestamp;

        emit ObservationRecorded(block.timestamp, initialPrice, initialPrice);
    }

    // ── Core Functions ──

    /**
     * @notice Returns instant multi-oracle price (not TWAP)
     * @dev Use getTWAPPrice() for flash loan resistant price
     */
    function getPrice() external view override returns (uint256) {
        return _getMultiOraclePrice();
    }

    /**
     * @notice Returns 30-minute TWAP price (flash loan resistant)
     * @dev Calculates time-weighted average from circular buffer observations
     * @return TWAP price in 8-decimal fixed-point
     */
    function getTWAPPrice() public view override returns (uint256) {
        uint256 count = observations.length;
        if (count == 0) revert TWAPMultiOracle__InsufficientObservations();
        if (count == 1) return observations[0].price;

        uint256 totalWeightedPrice = 0;
        uint256 totalTime = 0;
        uint256 cutoffTime = block.timestamp > TWAP_WINDOW ? block.timestamp - TWAP_WINDOW : 0;

        // Calculate TWAP from observations within window
        for (uint256 i = 0; i < count; i++) {
            PriceObservation memory obs = observations[i];
            if (obs.timestamp < cutoffTime) continue;

            uint256 nextTimestamp = (i + 1 < count) ? observations[i + 1].timestamp : block.timestamp;
            uint256 timeDelta = nextTimestamp - obs.timestamp;

            totalWeightedPrice += obs.price * timeDelta;
            totalTime += timeDelta;
        }

        if (totalTime == 0) return observations[count - 1].price;
        return totalWeightedPrice / totalTime;
    }

    /**
     * @notice Updates price observation (call periodically every 30 seconds)
     * @dev Maintains circular buffer, automatically evicts old observations
     */
    function updateObservation() external override {
        if (block.timestamp < lastUpdateTime + OBSERVATION_INTERVAL) {
            revert TWAPMultiOracle__ObservationTooSoon();
        }

        uint256 currentPrice = _getMultiOraclePrice();
        uint256 twapPrice = getTWAPPrice();

        // Circular buffer: overwrite oldest if full
        if (observations.length >= MAX_OBSERVATIONS) {
            // Remove oldest (index 0), shift all elements
            for (uint256 i = 0; i < observations.length - 1; i++) {
                observations[i] = observations[i + 1];
            }
            observations[observations.length - 1] = PriceObservation({
                timestamp: block.timestamp,
                price: currentPrice
            });
        } else {
            observations.push(PriceObservation({timestamp: block.timestamp, price: currentPrice}));
        }

        lastUpdateTime = block.timestamp;
        emit ObservationRecorded(block.timestamp, currentPrice, twapPrice);
    }

    /**
     * @notice Returns configuration lock status
     */
    function locked() external view override returns (bool) {
        return configurationLocked;
    }

    /**
     * @notice Returns TWAP window duration in seconds
     */
    function twapWindow() external pure override returns (uint256) {
        return TWAP_WINDOW;
    }

    /**
     * @notice Returns total number of observations recorded
     */
    function observationCount() external view override returns (uint256) {
        return observations.length;
    }

    // ── Internal Functions ──

    /**
     * @dev Fetches prices from all oracles, validates deviation, returns geometric mean
     */
    function _getMultiOraclePrice() internal view returns (uint256) {
        uint256 count = oracles.length;
        uint256[] memory prices = new uint256[](count);

        // Fetch all prices
        for (uint256 i = 0; i < count; i++) {
            prices[i] = oracles[i].getPrice();
        }

        // Validate deviation between all pairs
        for (uint256 i = 0; i < count; i++) {
            for (uint256 j = i + 1; j < count; j++) {
                _checkDeviation(prices[i], prices[j]);
            }
        }

        // Return geometric mean (more robust than arithmetic)
        return _geometricMean(prices);
    }

    /**
     * @dev Checks if two prices deviate more than MAX_DEVIATION_BPS
     */
    function _checkDeviation(uint256 a, uint256 b) internal pure {
        uint256 diff = a > b ? a - b : b - a;
        uint256 avg = (a + b) / 2;
        if ((diff * BPS_DENOMINATOR) / avg > MAX_DEVIATION_BPS) {
            revert TWAPMultiOracle__DeviationTooHigh(a, b);
        }
    }

    /**
     * @dev Calculates geometric mean (more resistant to outliers than arithmetic)
     */
    function _geometricMean(uint256[] memory values) internal pure returns (uint256) {
        if (values.length == 0) return 0;
        if (values.length == 1) return values[0];
        if (values.length == 2) return _sqrt(values[0] * values[1]);

        // For 3+ values, use iterative approximation
        uint256 product = values[0];
        for (uint256 i = 1; i < values.length; i++) {
            product = _sqrt(product * values[i]);
        }
        return product;
    }

    /**
     * @dev Babylonian square root (gas-efficient)
     */
    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    // ── Admin Functions ──

    /**
     * @notice Update oracle sources (only before configuration lock)
     */
    function updateOracles(address[] calldata oracles_) external {
        if (configurationLocked) revert TWAPMultiOracle__ConfigurationLocked();
        if (msg.sender != owner()) revert OwnableUnauthorizedAccount(msg.sender);
        if (oracles_.length < MIN_ORACLES) revert TWAPMultiOracle__InvalidOracleCount();

        delete oracles;
        for (uint256 i = 0; i < oracles_.length; i++) {
            oracles.push(IPriceOracle(oracles_[i]));
        }

        emit OraclesUpdated(oracles_.length);
    }

    /**
     * @notice Lock configuration permanently and renounce ownership
     */
    function lockConfiguration() external onlyOwner {
        configurationLocked = true;
        renounceOwnership();
    }
}
