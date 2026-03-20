// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IManagedAdapter} from "./interfaces/IManagedAdapter.sol";

interface IVToken {
    function mint(uint256 mintAmount) external returns (uint256);
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
    function exchangeRateStored() external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// @title IdleYieldAdapter — Yield-bearing buffer integrating Idle Finance
/// @notice 2nd yield rail: park excess idle in Idle to earn supply APY.
/// @dev Note: Idle mint/redeem returns 0 on success, non-zero error codes on failure.
/// @custom:security-contact security@wdkpilot.xyz
contract IdleYieldAdapter is Ownable2Step, IManagedAdapter {
    using SafeERC20 for IERC20;

    error IdleAdapter__CallerNotVault();
    error IdleAdapter__ConfigurationLocked();
    error IdleAdapter__ZeroAddress();
    error IdleAdapter__VaultNotSet();
    error IdleAdapter__ZeroAmount();
    error IdleAdapter__MintFailed(uint256 errorCode);
    error IdleAdapter__RedeemFailed(uint256 errorCode);
    error IdleAdapter__IdleDecimalsInvalid();

    IERC20 private immutable _asset;
    IVToken private immutable _vToken;
    uint256 public immutable exchangeRateScale;
    address public vault;
    bool public configurationLocked;

    modifier onlyVault() {
        if (msg.sender != vault) revert IdleAdapter__CallerNotVault();
        _;
    }

    constructor(
        address asset_,
        address idleToken_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (asset_ == address(0) || idleToken_ == address(0)) revert IdleAdapter__ZeroAddress();
        _asset = IERC20(asset_);
        _vToken = IVToken(idleToken_);

        uint8 assetDecimals = IERC20Metadata(asset_).decimals();
        uint8 idleTokenDecimals = _vToken.decimals();
        uint256 exponent = 18 + uint256(assetDecimals);

        if (exponent < idleTokenDecimals || exponent - idleTokenDecimals > 77) {
            revert IdleAdapter__IdleDecimalsInvalid();
        }

        exchangeRateScale = 10 ** (exponent - idleTokenDecimals);
    }

    function setVault(address vault_) external onlyOwner {
        if (configurationLocked) revert IdleAdapter__ConfigurationLocked();
        if (vault_ == address(0)) revert IdleAdapter__ZeroAddress();
        vault = vault_;
    }

    function lockConfiguration() external onlyOwner {
        if (vault == address(0)) revert IdleAdapter__VaultNotSet();
        configurationLocked = true;
        renounceOwnership();
    }

    function asset() external view returns (address) {
        return address(_asset);
    }

    function managedAssets() external view returns (uint256) {
        uint256 vTokenBalance = _vToken.balanceOf(address(this));
        uint256 exchangeRate = _vToken.exchangeRateStored();
        // exchangeRate is scaled by 10^(18 + underlyingDecimals - vTokenDecimals)
        uint256 underlyingBalance = (vTokenBalance * exchangeRate) / exchangeRateScale;
        return underlyingBalance + _asset.balanceOf(address(this));
    }

    function onVaultDeposit(uint256 amount) external onlyVault {
        if (amount == 0) revert IdleAdapter__ZeroAmount();
        _asset.safeTransferFrom(msg.sender, address(this), amount);
        _asset.forceApprove(address(_vToken), amount);
        uint256 err = _vToken.mint(amount);
        if (err != 0) revert IdleAdapter__MintFailed(err);
    }

    function withdrawToVault(uint256 amount) external onlyVault returns (uint256) {
        if (amount == 0) return 0;
        uint256 bal = _asset.balanceOf(address(this));
        if (bal < amount) {
            uint256 toRedeem = amount - bal;
            // Robustness: Idle may fail to redeem if liquidity is insufficient.
            // We handle the failure to ensure the vault waterfall can proceed.
            try _vToken.redeemUnderlying(toRedeem) returns (uint256 err) {
                if (err != 0) {
                    // Fail silently, return only what is currently idle in the adapter
                }
            } catch {
                // Fail silently
            }
        }
        uint256 actual = _asset.balanceOf(address(this));
        uint256 toTransfer = actual > amount ? amount : actual;
        
        if (toTransfer > 0) {
            _asset.safeTransfer(vault, toTransfer);
        }
        return toTransfer;
    }
}
