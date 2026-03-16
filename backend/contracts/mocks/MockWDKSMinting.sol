// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWDKSMinting} from "../interfaces/IWDKSMinting.sol";

/// @title MockWDKSMinting — test double for WDKS minting/redeeming at par
contract MockWDKSMinting is IWDKSMinting {
    IERC20 public usdt;
    IERC20 public wdks;

    constructor(address _usdt, address _wdks) {
        usdt = IERC20(_usdt);
        wdks = IERC20(_wdks);
    }

    /// @dev Mint WDKS 1:1 for USDT
    function mint(uint256 usdtAmount) external returns (uint256) {
        usdt.transferFrom(msg.sender, address(this), usdtAmount);
        wdks.transfer(msg.sender, usdtAmount);
        return usdtAmount;
    }

    /// @dev Redeem WDKS 1:1 for USDT
    function redeem(uint256 wdksAmount) external returns (uint256) {
        wdks.transferFrom(msg.sender, address(this), wdksAmount);
        usdt.transfer(msg.sender, wdksAmount);
        return wdksAmount;
    }
}
