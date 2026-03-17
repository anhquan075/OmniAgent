// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IManagedAdapter} from "./interfaces/IManagedAdapter.sol";

interface IPool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );
}

interface IAToken is IERC20 {
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
}

/// @title AaveLendingAdapter — Yield-bearing adapter for Aave V3 on BNB Chain
/// @notice 3rd yield rail: institution-grade lending via Aave V3.
/// @custom:security-contact security@wdkpilot.xyz
contract AaveLendingAdapter is Ownable2Step, IManagedAdapter {
    using SafeERC20 for IERC20;

    error AaveAdapter__CallerNotVault();
    error AaveAdapter__ConfigurationLocked();
    error AaveAdapter__ZeroAddress();
    error AaveAdapter__VaultNotSet();
    error AaveAdapter__ZeroAmount();

    IERC20 private immutable _asset;
    IAToken private immutable _aToken;
    IPool private immutable _pool;
    address public vault;
    bool public configurationLocked;

    modifier onlyVault() {
        if (msg.sender != vault) revert AaveAdapter__CallerNotVault();
        _;
    }

    constructor(
        address asset_,
        address aToken_,
        address pool_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (asset_ == address(0) || aToken_ == address(0) || pool_ == address(0)) {
            revert AaveAdapter__ZeroAddress();
        }
        _asset = IERC20(asset_);
        _aToken = IAToken(aToken_);
        _pool = IPool(pool_);
    }

    function setVault(address vault_) external onlyOwner {
        if (configurationLocked) revert AaveAdapter__ConfigurationLocked();
        if (vault_ == address(0)) revert AaveAdapter__ZeroAddress();
        vault = vault_;
    }

    function lockConfiguration() external onlyOwner {
        if (vault == address(0)) revert AaveAdapter__VaultNotSet();
        configurationLocked = true;
        renounceOwnership();
    }

    function asset() external view returns (address) {
        return address(_asset);
    }

    function managedAssets() external view returns (uint256) {
        return _aToken.balanceOf(address(this)) + _asset.balanceOf(address(this));
    }

    function onVaultDeposit(uint256 amount) external onlyVault {
        if (amount == 0) revert AaveAdapter__ZeroAmount();
        _asset.safeTransferFrom(msg.sender, address(this), amount);
        _asset.forceApprove(address(_pool), amount);
        _pool.supply(address(_asset), amount, address(this), 0);
    }

    function withdrawToVault(uint256 amount) external onlyVault returns (uint256) {
        if (amount == 0) return 0;
        uint256 bal = _asset.balanceOf(address(this));
        if (bal < amount) {
            uint256 toWithdraw = amount - bal;
            // Robustness: Aave V3 may revert if liquidity is insufficient.
            // We use try/catch to ensure the vault waterfall can proceed to other tiers.
            try _pool.withdraw(address(_asset), toWithdraw, address(this)) {
                // Success: assets are now in this contract
            } catch {
                // Failure: skip withdrawal, return only what is currently idle in the adapter
            }
        }
        uint256 actual = _asset.balanceOf(address(this));
        uint256 toTransfer = actual > amount ? amount : actual;
        
        if (toTransfer > 0) {
            _asset.safeTransfer(vault, toTransfer);
        }
        return toTransfer;
    }

    function getHealthFactor() external view returns (uint256) {
        (, , , , , uint256 healthFactor) = _pool.getUserAccountData(address(this));
        return healthFactor;
    }

    function getUserAccountData(address)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        return _pool.getUserAccountData(address(this));
    }
}
