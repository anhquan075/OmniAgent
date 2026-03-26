// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IManagedAdapter} from "../interfaces/IManagedAdapter.sol";

/// @title MockManagedAdapter — test adapter that can revert on demand
contract MockManagedAdapter is IManagedAdapter {
    using SafeERC20 for IERC20;

    IERC20 private immutable _asset;
    address public vault;
    bool public shouldRevert;

    error MockRevert();

    constructor(address asset_, address vault_) {
        _asset = IERC20(asset_);
        vault = vault_;
    }

    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }

    function managedAssets() external view returns (uint256) {
        if (shouldRevert) revert MockRevert();
        return _asset.balanceOf(address(this));
    }

    function asset() external view returns (address) {
        return address(_asset);
    }

    function onVaultDeposit(uint256 amount) external {
        if (shouldRevert) revert MockRevert();
        SafeERC20.safeTransferFrom(_asset, msg.sender, address(this), amount);
    }

    function withdrawToVault(uint256 amount) external returns (uint256) {
        if (shouldRevert) revert MockRevert();
        uint256 available = _asset.balanceOf(address(this));
        uint256 toSend = amount > available ? available : amount;
        if (toSend == 0) return 0;
        _asset.safeTransfer(vault, toSend);
        return toSend;
    }
}
