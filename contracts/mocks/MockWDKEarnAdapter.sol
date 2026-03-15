// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IWDKEarnAdapter} from "../interfaces/IWDKEarnAdapter.sol";
import {MockERC20} from "./MockERC20.sol";

/// @title MockWDKEarnAdapter — simple synchronous mock for `IWDKEarnAdapter`
contract MockWDKEarnAdapter is Ownable2Step, IWDKEarnAdapter {
    using SafeERC20 for IERC20;

    error MockWDKEarnAdapter__ZeroAsset();
    error MockWDKEarnAdapter__OnlyVault();
    error MockWDKEarnAdapter__ConfigurationLocked();
    error MockWDKEarnAdapter__ZeroVault();
    error MockWDKEarnAdapter__VaultNotSet();
    error MockWDKEarnAdapter__ZeroAmount();

    IERC20 private immutable _asset;
    address public vault;
    bool public configurationLocked;
    int256 public nextHarvestResult = 100 * 10**18; 

    modifier onlyVault() {
        if (msg.sender != vault) revert MockWDKEarnAdapter__OnlyVault();
        _;
    }

    constructor(address asset_, address initialOwner) Ownable(initialOwner) {
        if (asset_ == address(0)) revert MockWDKEarnAdapter__ZeroAsset();
        _asset = IERC20(asset_);
    }

    function setVault(address vault_) external onlyOwner {
        if (configurationLocked) revert MockWDKEarnAdapter__ConfigurationLocked();
        vault = vault_;
    }

    function lockConfiguration() external onlyOwner {
        configurationLocked = true;
        renounceOwnership();
    }

    function setNextHarvestResult(int256 amount) external {
        nextHarvestResult = amount;
    }

    function managedAssets() external view returns (uint256) {
        return _asset.balanceOf(address(this));
    }

    function asset() external view returns (address) {
        return address(_asset);
    }

    function onVaultDeposit(uint256 amount) external onlyVault {
        _asset.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdrawToVault(uint256 amount) external onlyVault returns (uint256 toSend) {
        uint256 available = _asset.balanceOf(address(this));
        toSend = amount > available ? available : amount;
        if (toSend > 0) _asset.safeTransfer(msg.sender, toSend);
    }

    function requestWithdraw(uint256 amount) external onlyVault returns (uint256 requestId) {
        uint256 available = _asset.balanceOf(address(this));
        uint256 toSend = amount > available ? available : amount;
        if (toSend > 0) _asset.safeTransfer(vault, toSend);
        emit WithdrawRequested(0, amount, block.timestamp);
        return 0;
    }

    function claimWithdraw(uint256) external onlyVault returns (uint256) { return 0; }

    function claimAllMatured() external onlyVault returns (uint256 totalClaimed) {
        totalClaimed = _asset.balanceOf(address(this));
        if (totalClaimed > 0) {
            _asset.safeTransfer(vault, totalClaimed);
        }
    }

    function harvestRewards() external returns (uint256) {
        if (nextHarvestResult > 0) {
            MockERC20(address(_asset)).mint(vault, uint256(nextHarvestResult));
        } else if (nextHarvestResult < 0) {
            uint256 loss = uint256(-nextHarvestResult);
            uint256 avail = _asset.balanceOf(address(this));
            if (loss > avail) loss = avail;
            if (loss > 0) _asset.safeTransfer(address(0xdead), loss);
        }
        return nextHarvestResult > 0 ? uint256(nextHarvestResult) : 0;
    }

    function totalPending() external pure returns (uint256) { return 0; }
    function pendingWithdrawals() external pure returns (WithdrawRequest[] memory) { return new WithdrawRequest[](0); }
    function maturedWithdrawals() external pure returns (uint256 count, uint256 totalAmount) { return (0, 0); }
}
