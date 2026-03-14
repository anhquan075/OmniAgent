// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IUSDFMinting — mint USDF from USDT and redeem back
interface IUSDFMinting {
    function mint(uint256 usdtAmount) external returns (uint256 usdfAmount);
    function redeem(uint256 usdfAmount) external returns (uint256 usdtAmount);
}
