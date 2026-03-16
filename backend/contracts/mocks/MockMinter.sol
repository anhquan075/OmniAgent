// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockMinter
/// @notice Mock implementation of WDKDEX minter for testing WDKEarnAdapter
contract MockMinter {
    mapping(address => uint256) public balances;

    /// @notice Mock deposit function
    function deposit(uint256 amount) external returns (bool) {
        balances[msg.sender] += amount;
        return true;
    }

    /// @notice Mock withdraw function
    function withdraw(uint256 amount) external returns (bool) {
        if (balances[msg.sender] >= amount) {
            balances[msg.sender] -= amount;
            return true;
        }
        return false;
    }

    /// @notice Mock managedAssets query function
    function getManagedAssets(address account) external view returns (uint256) {
        return balances[account];
    }
}
