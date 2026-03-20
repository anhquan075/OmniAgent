// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPriceOracle} from "./IPriceOracle.sol";

/**
 * @title ITWAPOracle
 * @notice Interface for Time-Weighted Average Price oracle with flash loan manipulation resistance
 * @dev Extends IPriceOracle with TWAP-specific functions for observation management
 */
interface ITWAPOracle is IPriceOracle {
    /// @notice Emitted when a new price observation is recorded
    event ObservationRecorded(uint256 indexed timestamp, uint256 price, uint256 twapPrice);

    /// @notice Emitted when TWAP window configuration is updated
    event TWAPWindowUpdated(uint256 oldWindow, uint256 newWindow);

    /// @notice Returns the current TWAP price over the configured window
    function getTWAPPrice() external view returns (uint256);

    /// @notice Updates the price observation (called periodically)
    function updateObservation() external;

    /// @notice Returns the configured TWAP window duration in seconds
    function twapWindow() external view returns (uint256);

    /// @notice Returns the total number of observations recorded
    function observationCount() external view returns (uint256);

    /// @notice Returns observation data at a specific index
    function observations(uint256 index) external view returns (uint256 timestamp, uint256 price);
}
