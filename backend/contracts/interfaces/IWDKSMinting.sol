// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IWDKSMinting — mint WDKS from USDT and redeem back
interface IWDKSMinting {
    function mint(uint256 usdtAmount) external returns (uint256 wdksAmount);
    function redeem(uint256 wdksAmount) external returns (uint256 usdtAmount);
}
