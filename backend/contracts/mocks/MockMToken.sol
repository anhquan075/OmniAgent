// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockMToken
 * @notice Mock implementation of Compound V2 / Moonwell mToken for testing
 * @dev Simulates lending protocol behavior with configurable exchange rate
 */
contract MockMToken is ERC20 {
    IERC20 public immutable underlying;
    uint256 private _exchangeRate;
    uint8 private immutable _decimals;

    // Compound uses 18 decimals for exchange rate internally
    uint256 private constant EXCHANGE_RATE_DECIMALS = 18;

    constructor(
        address underlying_,
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        underlying = IERC20(underlying_);
        _decimals = decimals_;
        // Standard Moonwell/Compound: underlyingAmount = (mTokenAmount * exchangeRate) / 1e18
        // For 1:1 ratio between 6-decimal USDC and 8-decimal mUSDC:
        // 1e6 underlying = (1e8 mToken * rate) / 1e18
        // rate = 1e6 * 1e18 / 1e8 = 1e16
        _exchangeRate = 1e16; 
    }

    /**
     * @notice Get token decimals
     * @return Number of decimals
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mint mTokens by depositing underlying tokens
     * @param mintAmount Amount of underlying tokens to deposit
     * @return 0 on success (Compound convention)
     */
    function mint(uint256 mintAmount) external returns (uint256) {
        require(mintAmount > 0, "MockMToken: zero amount");
        
        // Transfer underlying from user
        underlying.transferFrom(msg.sender, address(this), mintAmount);
        
        // Compound: mTokenAmount = underlyingAmount * 1e18 / exchangeRate
        uint256 mTokenAmount = (mintAmount * 1e18) / _exchangeRate;
        
        // Mint mTokens to user
        _mint(msg.sender, mTokenAmount);
        
        return 0; // Success
    }

    /**
     * @notice Redeem mTokens for underlying tokens
     * @param redeemAmount Amount of underlying tokens to withdraw
     * @return 0 on success (Compound convention)
     */
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256) {
        require(redeemAmount > 0, "MockMToken: zero amount");
        
        // Calculate mTokens to burn: mTokenAmount = underlyingAmount * 1e18 / exchangeRate
        uint256 mTokenAmount = (redeemAmount * 1e18) / _exchangeRate;
        require(balanceOf(msg.sender) >= mTokenAmount, "MockMToken: insufficient balance");
        
        // Burn mTokens from user
        _burn(msg.sender, mTokenAmount);
        
        // Transfer underlying to user
        underlying.transfer(msg.sender, redeemAmount);
        
        return 0; // Success
    }

    /**
     * @notice Get current exchange rate
     * @return Exchange rate (underlying per mToken, scaled by 1e18)
     */
    function exchangeRateStored() external view returns (uint256) {
        return _exchangeRate;
    }

    /**
     * @notice Set exchange rate for testing
     * @param newRate New exchange rate (scaled by 1e18)
     * @dev Higher rate = more underlying per mToken = profit for holders
     */
    function setExchangeRate(uint256 newRate) external {
        require(newRate > 0, "MockMToken: zero rate");
        _exchangeRate = newRate;
    }

    /**
     * @notice Simulate yield accrual by increasing exchange rate
     * @param basisPoints Basis points to increase (100 = 1%)
     */
    function accrueYield(uint256 basisPoints) external {
        _exchangeRate = (_exchangeRate * (10000 + basisPoints)) / 10000;
    }

    /**
     * @notice Get underlying balance controlled by this contract
     * @return Underlying token balance
     */
    function getCash() external view returns (uint256) {
        return underlying.balanceOf(address(this));
    }
}
