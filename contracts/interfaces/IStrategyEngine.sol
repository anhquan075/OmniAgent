// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IStrategyEngine
/// @notice Minimal interface for ExecutionAuction to interact with StrategyEngine
interface IStrategyEngine {
    /// @notice Execute a rebalance cycle. Bounty for execution goes to msg.sender.
    function executeCycle() external;

    /// @notice Seconds remaining until next cycle is executable (0 = ready now).
    function timeUntilNextCycle() external view returns (uint256);
}
