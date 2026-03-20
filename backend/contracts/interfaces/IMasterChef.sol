// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMasterChef — MasterChef interface for LP staking
/// @notice Interface for staking LP tokens and harvesting rewards
interface IMasterChef {
    /// @notice Deposit LP tokens into the farm pool
    /// @param pid Pool ID
    /// @param amount Amount of LP tokens to stake (0 = harvest only)
    function deposit(uint256 pid, uint256 amount) external;

    /// @notice Withdraw LP tokens from the farm pool
    /// @param pid Pool ID
    /// @param amount Amount of LP tokens to withdraw
    function withdraw(uint256 pid, uint256 amount) external;

    /// @notice Emergency withdraw without caring about rewards (if needed)
    /// @param pid Pool ID
    function emergencyWithdraw(uint256 pid) external;

    /// @notice Get pending CAKE rewards for a user
    /// @param pid Pool ID
    /// @param user User address
    /// @return Pending CAKE rewards
    function pendingCake(uint256 pid, address user) external view returns (uint256);

    /// @notice Get user staking info
    /// @param pid Pool ID
    /// @param user User address
    /// @return amount Staked LP amount
    /// @return rewardDebt Internal reward debt (used for calculations)
    function userInfo(uint256 pid, address user) external view returns (uint256 amount, uint256 rewardDebt);
}
