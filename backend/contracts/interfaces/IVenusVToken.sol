// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IVenusVToken {
    function mint(uint256 mintAmount) external returns (uint256);

    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);

    function balanceOf(address owner) external view returns (uint256);

    function exchangeRateStored() external view returns (uint256);

    function decimals() external view returns (uint8);
}
