// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IManagedAdapter} from "./interfaces/IManagedAdapter.sol";

/// @title ManagedAdapter — simple pass-through adapter holding idle assets on behalf of ProofVault
/// @custom:security-contact security@asterpilot.xyz
contract ManagedAdapter is Ownable2Step, IManagedAdapter {
    using SafeERC20 for IERC20;

    // ── errors ──
    error ManagedAdapter__ZeroAsset();
    error ManagedAdapter__OnlyVault();
    error ManagedAdapter__ConfigurationLocked();
    error ManagedAdapter__ZeroVault();
    error ManagedAdapter__VaultNotSet();
    error ManagedAdapter__ZeroAmount();

    IERC20 private immutable _asset;
    address public vault;
    bool public configurationLocked;

    event VaultUpdated(address indexed vaultAddress);
    event VaultDepositRecorded(uint256 amount);
    event VaultWithdrawal(uint256 requestedAmount, uint256 sentAmount);
    event ConfigurationLocked();

    modifier onlyVault() {
        if (msg.sender != vault) revert ManagedAdapter__OnlyVault();
        _;
    }

    constructor(address asset_, address initialOwner) Ownable(initialOwner) {
        if (asset_ == address(0)) revert ManagedAdapter__ZeroAsset();
        _asset = IERC20(asset_);
    }

    /*//////////////////////////////////////////////////////////////
                         CONFIGURATION (ONE-SHOT)
    //////////////////////////////////////////////////////////////*/

    function setVault(address vault_) external onlyOwner {
        if (configurationLocked) revert ManagedAdapter__ConfigurationLocked();
        if (vault_ == address(0)) revert ManagedAdapter__ZeroVault();
        vault = vault_;
        emit VaultUpdated(vault_);
    }

    function lockConfiguration() external onlyOwner {
        if (configurationLocked) revert ManagedAdapter__ConfigurationLocked();
        if (vault == address(0)) revert ManagedAdapter__VaultNotSet();
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
        if (amount == 0) revert ManagedAdapter__ZeroAmount();
        SafeERC20.safeTransferFrom(_asset, msg.sender, address(this), amount);
        emit VaultDepositRecorded(amount);
    }

    function withdrawToVault(uint256 amount) external onlyVault returns (uint256 toSend) {
        uint256 available = _asset.balanceOf(address(this));
        toSend = amount > available ? available : amount;
        if (toSend == 0) return 0;
        _asset.safeTransfer(vault, toSend);
        emit VaultWithdrawal(amount, toSend);
    }
}
