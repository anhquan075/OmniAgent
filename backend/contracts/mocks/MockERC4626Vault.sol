// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title MockERC4626Vault
 * @notice Mock implementation of ERC-4626 tokenized vault standard for testing
 * @dev Implements full ERC-4626 interface with configurable share conversion
 */
contract MockERC4626Vault is ERC20, IERC4626 {
    IERC20 private immutable _asset;
    uint8 private immutable _decimals;
    
    // Share conversion rate (shares per asset, scaled by 1e18)
    uint256 private _shareConversionRate;
    
    constructor(
        address asset_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        _asset = IERC20(asset_);
        _decimals = decimals_;
        _shareConversionRate = 1e18; // Initial 1:1 conversion
    }

    /**
     * @notice Get vault decimals
     * @return Number of decimals (matches asset decimals)
     */
    function decimals() public view virtual override(ERC20, IERC20Metadata) returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Get underlying asset address
     * @return Asset token address
     */
    function asset() public view virtual override returns (address) {
        return address(_asset);
    }

    /**
     * @notice Get total assets held by vault
     * @return Total asset balance
     */
    function totalAssets() public view virtual override returns (uint256) {
        return _asset.balanceOf(address(this));
    }

    /**
     * @notice Convert assets to shares
     * @param assets Amount of assets
     * @return shares Amount of shares
     */
    function convertToShares(uint256 assets) public view virtual override returns (uint256 shares) {
        uint256 supply = totalSupply();
        return supply == 0 ? assets : (assets * supply) / totalAssets();
    }

    /**
     * @notice Convert shares to assets
     * @param shares Amount of shares
     * @return assets Amount of assets
     */
    function convertToAssets(uint256 shares) public view virtual override returns (uint256 assets) {
        uint256 supply = totalSupply();
        return supply == 0 ? shares : (shares * totalAssets()) / supply;
    }

    /**
     * @notice Maximum deposit amount
     * @return Maximum uint256
     */
    function maxDeposit(address) public view virtual override returns (uint256) {
        return type(uint256).max;
    }

    /**
     * @notice Preview deposit operation
     * @param assets Amount of assets to deposit
     * @return shares Amount of shares to receive
     */
    function previewDeposit(uint256 assets) public view virtual override returns (uint256) {
        return convertToShares(assets);
    }

    /**
     * @notice Deposit assets and receive shares
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive shares
     * @return shares Amount of shares minted
     */
    function deposit(uint256 assets, address receiver) public virtual override returns (uint256 shares) {
        require(assets > 0, "MockERC4626Vault: zero amount");
        
        shares = previewDeposit(assets);
        require(shares > 0, "MockERC4626Vault: zero shares");
        
        _asset.transferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);
        
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /**
     * @notice Maximum mint amount
     * @return Maximum uint256
     */
    function maxMint(address) public view virtual override returns (uint256) {
        return type(uint256).max;
    }

    /**
     * @notice Preview mint operation
     * @param shares Amount of shares to mint
     * @return assets Amount of assets required
     */
    function previewMint(uint256 shares) public view virtual override returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? shares : (shares * totalAssets() + supply - 1) / supply;
    }

    /**
     * @notice Mint shares for deposited assets
     * @param shares Amount of shares to mint
     * @param receiver Address to receive shares
     * @return assets Amount of assets deposited
     */
    function mint(uint256 shares, address receiver) public virtual override returns (uint256 assets) {
        require(shares > 0, "MockERC4626Vault: zero shares");
        
        assets = previewMint(shares);
        
        _asset.transferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);
        
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /**
     * @notice Maximum withdraw amount
     * @param owner Address to check
     * @return assets Maximum withdrawable assets
     */
    function maxWithdraw(address owner) public view virtual override returns (uint256) {
        return convertToAssets(balanceOf(owner));
    }

    /**
     * @notice Preview withdraw operation
     * @param assets Amount of assets to withdraw
     * @return shares Amount of shares to burn
     */
    function previewWithdraw(uint256 assets) public view virtual override returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? assets : (assets * supply + totalAssets() - 1) / totalAssets();
    }

    /**
     * @notice Withdraw assets by burning shares
     * @param assets Amount of assets to withdraw
     * @param receiver Address to receive assets
     * @param owner Address that owns the shares
     * @return shares Amount of shares burned
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public virtual override returns (uint256 shares) {
        require(assets > 0, "MockERC4626Vault: zero amount");
        
        shares = previewWithdraw(assets);
        
        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }
        
        _burn(owner, shares);
        _asset.transfer(receiver, assets);
        
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /**
     * @notice Maximum redeem amount
     * @param owner Address to check
     * @return shares Maximum redeemable shares
     */
    function maxRedeem(address owner) public view virtual override returns (uint256) {
        return balanceOf(owner);
    }

    /**
     * @notice Preview redeem operation
     * @param shares Amount of shares to redeem
     * @return assets Amount of assets to receive
     */
    function previewRedeem(uint256 shares) public view virtual override returns (uint256) {
        return convertToAssets(shares);
    }

    /**
     * @notice Redeem shares for assets
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive assets
     * @param owner Address that owns the shares
     * @return assets Amount of assets withdrawn
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public virtual override returns (uint256 assets) {
        require(shares > 0, "MockERC4626Vault: zero shares");
        
        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }
        
        assets = previewRedeem(shares);
        
        _burn(owner, shares);
        _asset.transfer(receiver, assets);
        
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    /**
     * @notice Simulate yield accrual by adding assets without minting shares
     * @param amount Amount of assets to add
     * @dev This increases the value of existing shares
     */
    function accrueYield(uint256 amount) external {
        _asset.transferFrom(msg.sender, address(this), amount);
    }
}
