// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IManagedAdapter {
    function asset() external view returns (address);

    function managedAssets() external view returns (uint256);

    function onVaultDeposit(uint256 amount) external;

    function withdrawToVault(uint256 amount) external returns (uint256);
}
