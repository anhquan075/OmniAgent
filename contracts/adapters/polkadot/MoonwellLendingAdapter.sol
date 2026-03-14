// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IManagedAdapter} from "../../interfaces/IManagedAdapter.sol";
import {IVenusVToken} from "../../interfaces/IVenusVToken.sol";

/**
 * @title MoonwellLendingAdapter
 * @notice Polkadot Hub lending adapter for Rail 3 (LP yield or secondary lending)
 * @dev Manages deposits/withdrawals for Moonwell mToken lending markets.
 */
contract MoonwellLendingAdapter is Ownable2Step, ReentrancyGuard, IManagedAdapter {
    using SafeERC20 for IERC20;

    // --- Immutables ---
    IERC20 public immutable usdc;        // USDC on Polkadot Hub
    IVenusVToken public immutable mToken; // mUSDC on Polkadot Hub

    // --- State ---
    address public vault;
    bool public configurationLocked;

    // --- Events ---
    event VaultUpdated(address indexed vaultAddress);
    event ConfigurationLocked();
    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);

    // --- Errors ---
    error MoonwellLendingAdapter__ZeroAddress();
    error MoonwellLendingAdapter__OnlyVault();
    error MoonwellLendingAdapter__VaultNotSet();
    error MoonwellLendingAdapter__ConfigurationLocked();
    error MoonwellLendingAdapter__MintFailed();
    error MoonwellLendingAdapter__RedeemFailed();

    modifier onlyVault() {
        if (msg.sender != vault) revert MoonwellLendingAdapter__OnlyVault();
        _;
    }

    constructor(
        address assetAddress,
        address mTokenAddress,
        address initialOwner
    ) Ownable(initialOwner) {
        if (assetAddress == address(0) || mTokenAddress == address(0)) revert MoonwellLendingAdapter__ZeroAddress();

        usdc = IERC20(assetAddress);
        mToken = IVenusVToken(mTokenAddress);

        // Infinite approval for mToken to pull USDC
        usdc.forceApprove(mTokenAddress, type(uint256).max);
    }

    function setVault(address vaultAddress) external onlyOwner {
        if (configurationLocked) revert MoonwellLendingAdapter__ConfigurationLocked();
        if (vaultAddress == address(0)) revert MoonwellLendingAdapter__ZeroAddress();
        vault = vaultAddress;
        emit VaultUpdated(vaultAddress);
    }

    function lockConfiguration() external onlyOwner {
        if (configurationLocked) revert MoonwellLendingAdapter__ConfigurationLocked();
        if (vault == address(0)) revert MoonwellLendingAdapter__VaultNotSet();
        configurationLocked = true;
        emit ConfigurationLocked();
        _transferOwnership(address(0));
    }

    function asset() external view returns (address) {
        return address(usdc);
    }

    function managedAssets() public view returns (uint256) {
        uint256 mBalance = mToken.balanceOf(address(this));
        uint256 exchangeRate = mToken.exchangeRateStored();
        
        // Compound V2 / Moonwell exchange rate is scaled by 1e18.
        // underlying = (mTokenBalance * exchangeRate) / 1e18
        uint256 underlyingBalance = (mBalance * exchangeRate) / 1e18;
        
        return underlyingBalance + usdc.balanceOf(address(this));
    }

    function onVaultDeposit(uint256 amount) external onlyVault nonReentrant {
        SafeERC20.safeTransferFrom(usdc, msg.sender, address(this), amount);
        uint256 err = mToken.mint(amount);
        if (err != 0) revert MoonwellLendingAdapter__MintFailed();
        emit Deposited(amount);
    }

    function withdrawToVault(uint256 amount) external onlyVault nonReentrant returns (uint256) {
        if (amount == 0) return 0;

        uint256 totalAvailable = managedAssets();
        uint256 toRedeem = amount > totalAvailable ? totalAvailable : amount;
        
        if (toRedeem > 0) {
            uint256 err = mToken.redeemUnderlying(toRedeem);
            if (err != 0) revert MoonwellLendingAdapter__RedeemFailed();
        }

        uint256 balance = usdc.balanceOf(address(this));
        uint256 actual = balance < toRedeem ? balance : toRedeem;

        if (actual > 0) {
            SafeERC20.safeTransfer(usdc, msg.sender, actual);
        }

        emit Withdrawn(actual);
        return actual;
    }
}
