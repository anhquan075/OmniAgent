// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IWDKEarnAdapter} from "../interfaces/IWDKEarnAdapter.sol";

/// @title MockWDKEarnAdapter — simple synchronous mock for `IWDKEarnAdapter`
/// @dev Used in unit tests that don't need real async withdrawal semantics.
///      requestWithdraw immediately transfers funds to vault; claimAllMatured is a no-op.
contract MockWDKEarnAdapter is Ownable2Step, IWDKEarnAdapter {
    using SafeERC20 for IERC20;

    // ── errors ──
    error MockWDKEarnAdapter__ZeroAsset();
    error MockWDKEarnAdapter__OnlyVault();
    error MockWDKEarnAdapter__ConfigurationLocked();
    error MockWDKEarnAdapter__ZeroVault();
    error MockWDKEarnAdapter__VaultNotSet();
    error MockWDKEarnAdapter__ZeroAmount();

    IERC20 private immutable _asset;
    address public vault;
    bool public configurationLocked;

    event VaultUpdated(address indexed vaultAddress);
    event VaultDepositRecorded(uint256 amount);
    event VaultWithdrawal(uint256 requestedAmount, uint256 sentAmount);
    event ConfigurationLocked();

    modifier onlyVault() {
        if (msg.sender != vault) revert MockWDKEarnAdapter__OnlyVault();
        _;
    }

    constructor(address asset_, address initialOwner) Ownable(initialOwner) {
        if (asset_ == address(0)) revert MockWDKEarnAdapter__ZeroAsset();
        _asset = IERC20(asset_);
    }

    /*//////////////////////////////////////////////////////////////
                         CONFIGURATION (ONE-SHOT)
    //////////////////////////////////////////////////////////////*/

    function setVault(address vault_) external onlyOwner {
        if (configurationLocked)
            revert MockWDKEarnAdapter__ConfigurationLocked();
        if (vault_ == address(0)) revert MockWDKEarnAdapter__ZeroVault();
        vault = vault_;
        emit VaultUpdated(vault_);
    }

    function lockConfiguration() external onlyOwner {
        if (configurationLocked)
            revert MockWDKEarnAdapter__ConfigurationLocked();
        if (vault == address(0)) revert MockWDKEarnAdapter__VaultNotSet();
        configurationLocked = true;
        emit ConfigurationLocked();
        renounceOwnership();
    }

    /*//////////////////////////////////////////////////////////////
                          IMANAGEDADAPTER
    //////////////////////////////////////////////////////////////*/

    function managedAssets() external view returns (uint256) {
        return _asset.balanceOf(address(this));
    }

    function asset() external view returns (address) {
        return address(_asset);
    }

    function onVaultDeposit(uint256 amount) external onlyVault {
        if (amount == 0) revert MockWDKEarnAdapter__ZeroAmount();
        _asset.safeTransferFrom(msg.sender, address(this), amount);
        emit VaultDepositRecorded(amount);
    }

    function withdrawToVault(
        uint256 amount
    ) external onlyVault returns (uint256 toSend) {
        uint256 available = _asset.balanceOf(address(this));
        toSend = amount > available ? available : amount;
        if (toSend == 0) return 0;
        _asset.safeTransfer(msg.sender, toSend);
        emit VaultWithdrawal(amount, toSend);
    }

    /*//////////////////////////////////////////////////////////////
                         IASTEREARNADAPTER (SYNC STUBS)
    //////////////////////////////////////////////////////////////*/

    /// @dev Immediately withdraws to vault (synchronous mock — no real queue)
    function requestWithdraw(
        uint256 amount
    ) external onlyVault returns (uint256 requestId) {
        uint256 available = _asset.balanceOf(address(this));
        uint256 toSend = amount > available ? available : amount;
        if (toSend > 0) {
            _asset.safeTransfer(vault, toSend);
        }
        emit WithdrawRequested(0, amount, block.timestamp);
        return 0;
    }

    function claimWithdraw(
        uint256 /*index*/
    ) external onlyVault returns (uint256 claimed) {
        return 0;
    }

    function claimAllMatured()
        external
        onlyVault
        returns (uint256 totalClaimed)
    {
        totalClaimed = _asset.balanceOf(address(this));
        if (totalClaimed > 0) {
            _asset.safeTransfer(vault, totalClaimed);
        }
    }

    function totalPending() external pure returns (uint256) {
        return 0;
    }

    function pendingWithdrawals()
        external
        pure
        returns (WithdrawRequest[] memory)
    {
        return new WithdrawRequest[](0);
    }

    function maturedWithdrawals()
        external
        pure
        returns (uint256 count, uint256 totalAmount)
    {
        return (0, 0);
    }
}
