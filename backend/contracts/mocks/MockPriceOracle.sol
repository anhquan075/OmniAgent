// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IPriceOracle} from "../interfaces/IPriceOracle.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockPriceOracle
 * @notice Mock oracle for testing TWAP functionality
 */
contract MockPriceOracle is IPriceOracle, Ownable {
    uint256 private _price;
    bool private _locked;

    constructor(uint256 initialPrice) Ownable(msg.sender) {
        _price = initialPrice;
        _locked = false;
    }

    function getPrice() external view override returns (uint256) {
        return _price;
    }

    function locked() external view override returns (bool) {
        return _locked;
    }

    function setPrice(uint256 newPrice) external {
        if (_locked) revert("Locked");
        _price = newPrice;
    }

    function setLocked(bool isLocked) external {
        _locked = isLocked;
    }

    function lock() external {
        _locked = true;
        renounceOwnership();
    }
}
