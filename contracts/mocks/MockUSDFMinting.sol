// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUSDFMinting} from "../interfaces/IUSDFMinting.sol";

/// @title MockUSDFMinting — test double for USDF minting/redeeming at par
contract MockUSDFMinting is IUSDFMinting {
    IERC20 public usdt;
    IERC20 public usdf;

    constructor(address _usdt, address _usdf) {
        usdt = IERC20(_usdt);
        usdf = IERC20(_usdf);
    }

    /// @dev Mint USDF 1:1 for USDT
    function mint(uint256 usdtAmount) external returns (uint256) {
        usdt.transferFrom(msg.sender, address(this), usdtAmount);
        usdf.transfer(msg.sender, usdtAmount);
        return usdtAmount;
    }

    /// @dev Redeem USDF 1:1 for USDT
    function redeem(uint256 usdfAmount) external returns (uint256) {
        usdf.transferFrom(msg.sender, address(this), usdfAmount);
        usdt.transfer(msg.sender, usdfAmount);
        return usdfAmount;
    }
}
