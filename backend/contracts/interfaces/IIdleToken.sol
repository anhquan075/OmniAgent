// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IIdleToken
/// @notice Interface for idle buffer tokens (e.g., aUSDT on Aave, idleUSDT on Idle)
interface IIdleToken {
    function mint(uint256 mintAmount) external returns (uint256);

    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);

    function balanceOf(address owner) external view returns (uint256);

    function exchangeRateStored() external view returns (uint256);

    function decimals() external view returns (uint8);
}
